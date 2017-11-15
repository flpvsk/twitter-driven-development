require('dotenv').config();
const _ = require('lodash');
const util = require('util');
const Twitter = require('twitter');
const emojiRegex = require('emoji-regex')();
const api = require('./api');

api.startServer();

const isTweet = _.conforms({
  id_str: _.isString,
  text: _.isString,
  user: _.isObject
});

const WORK_CENTER_PO = 'po';
const WORK_CENTER_DEV = 'dev';
const WORK_CENTER_QA = 'qa';
const DONE = 'done';

const USER_CATEGORIES = [
  'customer',
  'po',
  'dev',
  'qa'
];

const TWEET_CUSTOMER = 'customer_tweet';
const TWEET_PO = 'po_tweet';
const TWEET_DEV = 'dev_tweet';
const TWEET_QA_APPROVED = 'qa_approved_tweet';
const TWEET_QA_REJECTED = 'qa_rejected_tweet';

const NOTIFICATION_TASK_COMPLETED = 'NOTIFICATION_TASK_COMPLETED';
const NOTIFICATION_FOR_PO = 'NOTIFICATION_FOR_PO';
const NOTIFICATION_FOR_DEV_NEW = 'NOTIFICATION_FOR_DEV_NEW';
const NOTIFICATION_FOR_DEV_REJECTED = 'NOTIFICATION_FOR_DEV_REJECTED';
const NOTIFICATION_FOR_QA = 'NOTIFICATION_FOR_QA';
const NOTIFICATION_USER_JOINED = 'NOTIFICATION_USER_JOINED';
const NOTIFICATION_USER_LEFT = 'NOTIFICATION_USER_LEFT';

const NOTIFICATION_TEXT_BY_TYPE = {
  [NOTIFICATION_TASK_COMPLETED]: [
    `congrats on your finished task 🙌  `,
    `woohoo! this task is done! `,
    `done and done 🔥 `,
    `task – ✅ you – 🤘 `,
  ],
  [NOTIFICATION_FOR_PO]: [
    (
      `Check out this task from a customer. ` +
      `Reply to the tweet referenced below with a gif-spec: `
    ),
    (
      `Incoming req from a customer. ` +
      `Do that thing you do so well – ` +
      `gif-reply to the attached tweet: `
    ),
    (
      `Here's a request from a customer. ` +
      `Reply with a gif to their tweet: `
    )
  ],
  [NOTIFICATION_FOR_DEV_NEW]: [
    (
      `Check out this spec from a PO. ` +
      `Reply to the tweet referenced below with ` +
      `your emoji-implementation: `
    )
  ],
  [NOTIFICATION_FOR_DEV_REJECTED]: [
    (
      `Your implementation was rejected by QA. ` +
      `Reply to the tweet referenced below with ` +
      `the new emoji-implementation: `
    )
  ],
  [NOTIFICATION_FOR_QA]: [
    (
      `Check out this implementation from a developer. ` +
      `Reply to the tweet referenced below with ` +
      `"approved" or "rejected"`
    )
  ]
};

const WORK_CENTER_BY_TWEET_TYPE = {
  [TWEET_PO]: WORK_CENTER_PO,
  [TWEET_DEV]: WORK_CENTER_DEV,
  [TWEET_QA_APPROVED]: WORK_CENTER_QA,
  [TWEET_QA_REJECTED]: WORK_CENTER_QA
};


const hasGif = (msg) => {
  if (!msg || !msg.extended_entities || !msg.extended_entities.media) {
    return false;
  }

  return _.some(
    msg.extended_entities.media,
    (media) => media.type === 'animated_gif'
  );
};

const isPositiveAnswer = (text) => {
  return (
    text.toLowerCase().indexOf('good to go') > -1 ||
    text.toLowerCase().indexOf('cool') > -1 ||
    text.toLowerCase().indexOf('approved') > -1
  );
};

const getTweetUrl = (username, tweetId) => {
  return `https://twitter.com/${username}/statuses/${tweetId}`;
}


const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

// State (all the indexes required)
const tweetThreads = new Set();
const tweetTimeById = {};
const tweetParentById = {};
const tweetThreadById = {};
const threadEndById = {};
const tweetTypeById = {};
const threadStatusById = {};
const tweetUsernameById = {};
const notifications = [];

// State (users)

const ADMIN_ID = '929069070892355585';// '171462019';
const SELF_ID = '929069070892355585';
const SELF_USERNAME = 'mngr999';

let usersByCategory = {
  customer: [
    // '929069070892355585',
    // '171462019'
  ],
  po: [
    // '929069070892355585'
  ],
  dev: [
    // '929069070892355585'
  ],
  qa: [
    // '929069070892355585'
  ]
};

let categoryByUserId = {};

let usernameByUserId = {
  // '929069070892355585': 'mngr999',
  // '171462019': 'flpvsk'
};

// State (game)

let globalStream;
let gameHashTag = undefined;
const isGameHashTag = (htObj) => htObj.text === gameHashTag;


const startWatching = () => {
  globalStream && globalStream.destroy();

  const customerSet = new Set(usersByCategory.customer);
  const poSet = new Set(usersByCategory.po);
  const devSet = new Set(usersByCategory.dev);
  const qaSet = new Set(usersByCategory.qa);

  const usersToFollow = (
    [
      ...(new Set([
        ...customerSet,
        ...devSet,
        ...poSet,
        ...qaSet
      ]))
    ].join(',')
  );

  client.stream('statuses/filter',
    {follow: `${usersToFollow}`, track: `@${SELF_USERNAME}`},
    (stream) => {
      globalStream = stream;

      stream.on('error', (err) => {
        console.error(err);
        process.exit(1);
      });

      stream.on('data', (msg) => {
        if (!isTweet(msg)) {
          const str = util.inspect(msg, {depth: null});
          console.warn('Not a tweet', str);
          return;
        }

        if (msg.retweeted_status) {
          const url = getTweetUrl(msg.user.screen_name, msg.id_str);
          console.warn('Ignoring a retweet', url);
          return;
        }

        // console.log(str);

        // Pre-game actions
        // Starting new game
        if (
          msg.user.id_str === ADMIN_ID &&
          msg.text.toLowerCase().indexOf('start') > -1 &&
          msg.entities.hashtags &&
          msg.entities.hashtags.length > 0 &&
          msg.entities.hashtags[0].text !== gameHashTag
        ) {
          gameHashTag = msg.entities.hashtags[0].text;

          console.log('Starting a game with', gameHashTag);
          startWatching();
        }

        // Adding user
        if (
          !usernameByUserId[msg.user.id_str] &&
          msg.text.toLowerCase().indexOf('join') > -1
        ) {
          const userId = msg.user.id_str;
          const userCategoryIndex = (
            Object.keys(usernameByUserId).length %
            USER_CATEGORIES.length
          );
          const userCategory = USER_CATEGORIES[userCategoryIndex];
          const username = msg.user.screen_name;

          usernameByUserId[userId] = username;
          usersByCategory[userCategory].push(userId)
          categoryByUserId[userId] = userCategory;
          notifications.push({
            type: NOTIFICATION_USER_JOINED,
            userId,
            username,
            category: userCategory
          });
          startWatching();
          console.log('user joined', userId, userCategory);
        }


        // Removing user
        if (
          usernameByUserId[msg.user.id_str] &&
          msg.text.toLowerCase().indexOf('leave') > -1
        ) {
          const userId = msg.user.id_str;
          const category = categoryByUserId[userId];
          const username = msg.user.screen_name;

          usernameByUserId = _.omit(usernameByUserId, userId);
          usersByCategory[category] = _.without(
            usersByCategory[category], userId
          );
          categoryByUserId = _.omit(categoryByUserId, userId);

          notifications.push({
            type: NOTIFICATION_USER_LEFT,
            userId,
            username,
            category
          });

          console.log('user left', userId, category);
        }

        // During-game actions
        const userId = msg.user.id_str;
        const username = msg.user.screen_name;
        const tweetId = msg.id_str;
        const parentId = msg.in_reply_to_status_id_str;
        const timestamp = parseInt(msg.timestamp_ms);


        // 1. Customer tweets something with a hashtag: C1
        if (
          customerSet.has(userId) &&
          _.some(msg.entities.hashtags, isGameHashTag) &&
          !parentId
        ) {
          tweetTimeById[tweetId] = timestamp;
          tweetTypeById[tweetId] = TWEET_CUSTOMER;
          tweetThreadById[tweetId] = tweetId;
          tweetUsernameById[tweetId] = username;
          threadStatusById[tweetId] = WORK_CENTER_PO;
          tweetThreads.add(tweetId);

          notifications.push({
            type: NOTIFICATION_FOR_PO,
            tweetId: tweetId
          });

          return;
        }


        // 2. PO replies to C1 with a gif: P1
        if (
          poSet.has(userId) &&
          hasGif(msg) &&
          tweetTypeById[parentId] === TWEET_CUSTOMER
        ) {
          tweetTimeById[tweetId] = timestamp;
          tweetTypeById[tweetId] = TWEET_PO;
          tweetUsernameById[tweetId] = username;
          tweetParentById[tweetId] = parentId;
          tweetThreadById[tweetId] = parentId;
          threadStatusById[parentId] = WORK_CENTER_DEV;

          notifications.push({
            type: NOTIFICATION_FOR_DEV_NEW,
            tweetId: tweetId
          });

          return;
        }

        const hasDevOrQATweetParent = (
          tweetTypeById[parentId] === TWEET_PO ||
          tweetTypeById[parentId] === TWEET_QA_REJECTED
        );

        // 3. DEV replies to P1 with emoji
        if (
          devSet.has(userId) &&
          emojiRegex.test(msg.text) &&
          hasDevOrQATweetParent
        ) {
          const threadId = tweetThreadById[parentId];

          tweetThreadById[tweetId] = threadId;
          tweetParentById[tweetId] = parentId;
          tweetUsernameById[tweetId] = username;
          tweetTimeById[tweetId] = timestamp;
          tweetTypeById[tweetId] = TWEET_DEV;

          if (!threadEndById[threadId]) {
            threadStatusById[threadId] = WORK_CENTER_QA;

            notifications.push({
              type: NOTIFICATION_FOR_QA,
              tweetId: tweetId
            });

            return;
          }
        }


        // 4. QA approving
        if (
          qaSet.has(userId) &&
          tweetTypeById[parentId] === TWEET_DEV &&
          isPositiveAnswer(msg.text)
        ) {
          const threadId = tweetThreadById[parentId];

          tweetThreadById[tweetId] = threadId;
          tweetParentById[tweetId] = parentId;
          tweetUsernameById[tweetId] = username;
          tweetTimeById[tweetId] = timestamp;
          tweetTypeById[tweetId] = TWEET_QA_APPROVED;

          threadEndById[threadId] = tweetId;
          threadStatusById[threadId] = DONE;

          notifications.push({
            type: NOTIFICATION_TASK_COMPLETED,
            threadId: threadId,
            lastTweetId: tweetId
          });

          return;
        }


        // 4. QA rejecting
        if (
          qaSet.has(userId) &&
          tweetTypeById[parentId] === TWEET_DEV &&
          !isPositiveAnswer(msg.text)
        ) {
          const threadId = tweetThreadById[parentId];

          tweetThreadById[tweetId] = threadId;
          tweetParentById[tweetId] = parentId;
          tweetUsernameById[tweetId] = username;
          tweetTimeById[tweetId] = timestamp;
          tweetTypeById[tweetId] = TWEET_QA_REJECTED;

          if (threadEndById[threadId]) {
            return;
          }

          threadStatusById[threadId] = WORK_CENTER_DEV;
          notifications.push({
            type: NOTIFICATION_FOR_DEV_REJECTED,
            tweetId: tweetId,
            devUsername: tweetUsernameById[parentId]
          });
          return;
        }

      });

    });
};


// Reporting
setInterval(() => {
  let minSysLeadTime = Infinity;
  let maxSysLeadTime = Infinity;
  let avgSysLeadTime = Infinity;
  let leadTimes = [];
  let leadTimesByWorkCenter = {
    [WORK_CENTER_PO]: [],
    [WORK_CENTER_DEV]: [],
    [WORK_CENTER_QA]: []
  };
  let leadTimesByTeamId = {};
  let usernamesByTeamId = {};

  let inventory = 0;
  let defects = 0;
  let done = 0;
  let inventoryByWorkCenter = {
    [WORK_CENTER_PO]: 0,
    [WORK_CENTER_DEV]: 0,
    [WORK_CENTER_QA]: 0
  };


  for (let threadId of [...tweetThreads]) {
    let startTime = tweetTimeById[threadId];
    let threadEnd = threadEndById[threadId];
    let endTime = threadEnd ? tweetTimeById[threadEnd] : undefined;

    if (endTime) {
      let leadTime = (endTime - startTime) / 1000;
      let usernames = collectUsernames(threadEnd);
      let teamId = usernames.join('-');
      let teamLeadTimes = leadTimesByTeamId[teamId] || [];
      leadTimes.push(leadTime);
      teamLeadTimes.push(leadTime);
      leadTimesByTeamId[teamId] = teamLeadTimes;
      usernamesByTeamId[teamId] = usernames;
      done += 1;
      continue;
    }

    if (!endTime) {
      inventory += 1;
      inventoryByWorkCenter[threadStatusById[threadId]] += 1;
    }
  }

  for (let [tweetId, parentId] of _.entries(tweetParentById)) {
    const tweetType = tweetTypeById[tweetId];
    const workCenter = WORK_CENTER_BY_TWEET_TYPE[tweetType];
    leadTimesByWorkCenter[workCenter].push(
      (tweetTimeById[tweetId] - tweetTimeById[parentId]) / 1000
    );
  }


  // number of deffects
  for (let [tweetId, type] of _.entries(tweetTypeById)) {
    if (type === TWEET_QA_REJECTED) {
      defects += 1;
    }
  }


  // Aggregating values
  const leadTimeReduced = {
    min: _.min(leadTimes),
    max: _.max(leadTimes),
    avg: _.mean(leadTimes) || undefined
  };


  const leadTimesByWorkCenterReduced = {
    [WORK_CENTER_PO]: {
      min: _.min(leadTimesByWorkCenter[WORK_CENTER_PO]),
      max: _.max(leadTimesByWorkCenter[WORK_CENTER_PO]),
      avg: _.mean(leadTimesByWorkCenter[WORK_CENTER_PO]) || undefined
    },
    [WORK_CENTER_DEV]: {
      min: _.min(leadTimesByWorkCenter[WORK_CENTER_DEV]),
      max: _.max(leadTimesByWorkCenter[WORK_CENTER_DEV]),
      avg: _.mean(leadTimesByWorkCenter[WORK_CENTER_DEV]) || undefined
    },
    [WORK_CENTER_QA]: {
      min: _.min(leadTimesByWorkCenter[WORK_CENTER_QA]),
      max: _.max(leadTimesByWorkCenter[WORK_CENTER_QA]),
      avg: _.mean(leadTimesByWorkCenter[WORK_CENTER_QA]) || undefined
    }
  };


  // Scores
  let scores = [];
  for (let [teamId, leadTimes] of _.entries(leadTimesByTeamId)) {
    let min = _.min(leadTimes);
    let max = _.max(leadTimes);
    let mean = _.mean(leadTimes);
    let variance = (
      leadTimes.reduce((acc, leadTime) => {
        return acc + Math.pow(leadTime - mean, 2);
      }, 0) / leadTimes.length
    );
    let deviation = Math.sqrt(variance);
    let tasksDoneNumber = leadTimes.length;
    let points = Math.round(
      Math.pow(tasksDoneNumber, 2) /
      (mean * (deviation || 10))
    );
    let score = {
      usernames: usernamesByTeamId[teamId],
      varianceLeadTime: variance,
      meanLeadTime: mean,
      tasksDoneNumber,
      points
    };

    scores.push(score);
  }

  scores = _.sortBy(scores, (score) => score.points);
  _.forEach(scores, (score, index) => {
    score.place = index + 1;
  });

  api.broadcast(JSON.stringify({
    hashtag: gameHashTag,
    participantsNumber: Object.keys(usernameByUserId).length,
    tasksInProgressNumber: inventory,
    tasksDoneNumber: done,
    poInProgressNumber: inventoryByWorkCenter[WORK_CENTER_PO],
    devInProgressNumber: inventoryByWorkCenter[WORK_CENTER_DEV],
    qaInProgressNumber: inventoryByWorkCenter[WORK_CENTER_QA],
    poThroughput: leadTimesByWorkCenterReduced[WORK_CENTER_PO].avg,
    devThroughput: leadTimesByWorkCenterReduced[WORK_CENTER_DEV].avg,
    qaThroughput: leadTimesByWorkCenterReduced[WORK_CENTER_QA].avg,
    scoreboardData: scores
  }));

  // console.log('System lead times', leadTimeReduced);
  // console.log('Work center lead times', leadTimesByWorkCenterReduced);
  // console.log('Inventory', inventory, 'Defects', defects);
  // console.log('Inventory by work center', inventoryByWorkCenter);
  // console.log('==============================\n');
}, 5000);


const collectUsernames = (lastTweetId) => {
  let usernames = new Set();
  usernames.add(tweetUsernameById[lastTweetId]);
  let parentId = tweetParentById[lastTweetId];

  while (parentId) {
    let tweetId = parentId;
    parentId = tweetParentById[tweetId];
    usernames.add(tweetUsernameById[tweetId]);
  }
  return [...usernames];
};


// Notifications
setInterval(() => {
  while (notifications.length > 0) {
    let notification = notifications.pop();

    if (notification.type === NOTIFICATION_TASK_COMPLETED) {
      const threadId = notification.threadId;
      const usernames = collectUsernames(notification.lastTweetId);
      const usernamesStr = usernames.map(u => `@${u}`).join(' ');
      const qaUsername = tweetUsernameById[notification.lastTweetId];
      const lastTweetId = notification.lastTweetId;
      const leadTime = Math.round((
        tweetTimeById[lastTweetId] -
        tweetTimeById[threadId]
      ) / 1000);

      const text = (
        `${usernamesStr} congrats on your finished task 🙌  ` +
        `Your time: ${leadTime}s. ` +
        getTweetUrl(qaUsername, lastTweetId)
      );

      console.log('sending', text);

      client
        .post('statuses/update', {
          status: text
        })
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    if (notification.type === NOTIFICATION_FOR_PO) {
      const poList = usersByCategory.po;
      const poIndex = (
        tweetThreads.size % poList.length
      );

      const poId = poList[poIndex];
      const poUsername = usernameByUserId[poId];
      const tweetId = notification.tweetId;
      const customerUsername = tweetUsernameById[tweetId];
      const text = (
        `@${poUsername} Check out this task from a customer. ` +
        `Reply to the tweet referenced below with a gif-spec: ` +
        getTweetUrl(customerUsername, tweetId)
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    if (notification.type === NOTIFICATION_FOR_DEV_NEW) {
      const devList = usersByCategory.dev;
      const devIndex = (
        tweetThreads.size % devList.length
      );

      const devId = devList[devIndex];
      const devUsername = usernameByUserId[devId];
      const tweetId = notification.tweetId;
      const poUsername = tweetUsernameById[tweetId];
      const text = (
        `@${devUsername} Check out this spec from a PO. ` +
        `Reply to the tweet referenced below with ` +
        `your emoji-implementation: ` +
        getTweetUrl(poUsername, tweetId)
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    if (notification.type === NOTIFICATION_FOR_DEV_REJECTED) {
      const devUsername = notification.devUsername;
      const tweetId = notification.tweetId;
      const qaUsername = tweetUsernameById[tweetId];
      const text = (
        `@${devUsername} Your implementation was rejected by QA. ` +
        `Reply to the tweet referenced below with ` +
        `the new emoji-implementation: ` +
        getTweetUrl(qaUsername, tweetId)
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    if (notification.type === NOTIFICATION_FOR_QA) {
      const qaList = usersByCategory.qa;
      const qaIndex = (
        tweetThreads.size % qaList.length
      );

      const qaId = qaList[qaIndex];
      const qaUsername = usernameByUserId[qaId];
      const tweetId = notification.tweetId;
      const devUsername = tweetUsernameById[tweetId];
      const text = (
        `@${qaUsername} Check out this implementation from a developer. ` +
        `Reply to the tweet referenced below with ` +
        `"approved" or "rejected"` +
        getTweetUrl(devUsername, tweetId)
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    NOTIFICATION_USER_JOINED;
    NOTIFICATION_USER_LEFT;

    if (notification.type === NOTIFICATION_USER_JOINED) {
      const text = (
        `@${notification.username} thanks for joining ` +
        `our disruptive startup!\n\n` +
        `Your role: ${notification.category.toUpperCase()}.\n\n` +
        `Here's smth from our HR: ` +
        `https://github.com/flpvsk/twitter-driven-development` +
        `/blob/master/README.md`
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }

    if (notification.type === NOTIFICATION_USER_LEFT) {
      const text = (
        `@${notification.username} sorry to see you go... ` +
        `We do hope that you'll return all the company pens ` +
        `you took home.`
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }
  }
}, 1000);


// TODO: more variations of texts

startWatching();
