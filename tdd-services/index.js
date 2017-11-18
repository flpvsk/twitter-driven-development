require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
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

const BACKUP_PATH = (
  process.env.BACKUP_PATH ||
  `${process.env.HOME}/tmp/tdd-data.json`
);
const BACKUP_INTERVAL = 10000;
const REPORTING_INTERVAL = 3000;
const NOTIFICATIONS_INTERVAL = 5000;
const WATCHER_RESTART_INTERVAL = 5000;

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
    `congrats on your finished task 🙌  Your lead time:`,
    `woohoo! this task is done! Lead time:`,
    `done and done 🔥  Your time:`,
    `task – ✅ you – 🤘  Lead time –`,
  ],
  [NOTIFICATION_FOR_PO]: [
    (
      `Check out this task from a customer. ` +
      `Reply to the tweet referenced below with a gif-spec:`
    ),
    (
      `Incoming req from a customer. ` +
      `Do that thing you do so well – ` +
      `gif-reply to the attached tweet:`
    ),
    (
      `Here's a request from a customer. ` +
      `Reply with a gif to their tweet:`
    )
  ],
  [NOTIFICATION_FOR_DEV_NEW]: [
    (
      `Check out this spec from a PO. ` +
      `Reply to the tweet referenced below with ` +
      `your emoji-implementation:`
    ),
    (
      `Do that emoji-magic you engineers do and make it work! ` +
      `By when? YESTERDAY, of course! ` +
      `Reply to this tweet:`
    )
  ],
  [NOTIFICATION_FOR_DEV_REJECTED]: [
    (
      `Your implementation was rejected by QA. ` +
      `Reply to the tweet referenced below with ` +
      `the new emoji-implementation:`
    ),
    (
      `Bad news, it doesn't work according to spec. ` +
      `Fix it and reply to the tweet below:`
    )
  ],
  [NOTIFICATION_FOR_QA]: [
    (
      `Check out this implementation from a developer. ` +
      `Reply to the tweet referenced below with ` +
      `"approved" or "rejected"`
    ),
    (
      `Hey, do you "approve" of this? Or will you "reject"? ` +
      `It's all up to you now. Reply to this tweet:`
    )
  ],
  [NOTIFICATION_USER_JOINED]: [
    (
      `thanks for joining our disruptive startup!\n\n` +
      `Your role:`
    ),
    (
      `looking forward to working with you! It's hard to find ` +
      `professionals like youself that work only for shares ` +
      `and no salary..\n\n` +
      `You joined as:`
    )
  ],

  [NOTIFICATION_USER_LEFT]: [
    (
      `was a pleasure working with you! ` +
      `You do know you have to pay for all the snacks you ate ` +
      `at the office, right?`
    ),

    (
      `sorry to see you go.. To be honest I wish I could do the same`
    ),

    (
      `good bye, remember all the NDAs and non-competes you signed?`
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
let tweetThreads = new Set();
let tweetTimeById = {};
let tweetParentById = {};
let tweetThreadById = {};
let threadEndById = {};
let tweetTypeById = {};
let threadStatusById = {};
let tweetUsernameById = {};
let notifications = [];

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
let gameHashtag = undefined;
let restartWatcher = false;
// gameHashtag = 'test';
const isGameHashTag = (htObj) => htObj.text === gameHashtag;


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
        writeBackup().then(() => process.exit(1));
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

        if (msg.is_quote_status) {
          const url = getTweetUrl(msg.user.screen_name, msg.id_str);
          console.warn('Ignoring a quote', url);
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
          msg.entities.hashtags[0].text !== gameHashtag
        ) {
          gameHashtag = msg.entities.hashtags[0].text;

          console.log('Starting a game with', gameHashtag);
          tweetThreads = new Set();
          tweetTimeById = {};
          tweetParentById = {};
          tweetThreadById = {};
          threadEndById = {};
          tweetTypeById = {}
          threadStatusById = {};
          tweetUsernameById = {};
          notifications = [];

          restartWatcher = true;
          return;
        }

        // Adding user
        if (
          !usernameByUserId[msg.user.id_str] &&
          msg.text.toLowerCase().indexOf('join') > -1 &&
          msg.text.toLowerCase().indexOf(`@${SELF_USERNAME}`) > -1 &&
          !msg.in_reply_to_status_id
        ) {
          const userId = msg.user.id_str;

          let userCategory = _.find(USER_CATEGORIES, (cat) => {
            return msg.text.toLowerCase().indexOf(cat) > -1;
          });

          const userCategoryIndex = (
            Object.keys(usernameByUserId).length %
            USER_CATEGORIES.length
          );

          userCategory = (
            userCategory ||
            USER_CATEGORIES[userCategoryIndex]
          );

          const username = msg.user.screen_name;

          usernameByUserId[userId] = username;
          usersByCategory[userCategory].push(userId)
          categoryByUserId[userId] = userCategory;
          notifications.push({
            type: NOTIFICATION_USER_JOINED,
            userId,
            username,
            category: userCategory,
            tweetId: msg.id_str
          });

          restartWatcher = true;
          console.log('user joined', userId, userCategory);
          return;
        }


        // Removing user
        if (
          usernameByUserId[msg.user.id_str] &&
          msg.text.toLowerCase().indexOf('leave') > -1 &&
          msg.text.toLowerCase().indexOf(`@${SELF_USERNAME}`) > -1 &&
          !msg.in_reply_to_status_id
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
            category,
            tweetId: msg.id_str
          });

          restartWatcher = true;
          console.log('user left', userId, category);
          return;
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
          !tweetThreads.has(tweetId) &&
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

          console.log(
            '[game]',
            'new job',
            getTweetUrl(username, tweetId)
          );

          return;
        }


        // 2. PO replies to C1 with a gif: P1
        if (
          poSet.has(userId) &&
          hasGif(msg) &&
          tweetTypeById[parentId] === TWEET_CUSTOMER &&
          !threadEndById[parentId]
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

          console.log(
            '[game]',
            'job moved to DEV',
            getTweetUrl(username, tweetId)
          );

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

            console.log(
              '[game]',
              'job moved to QA',
              getTweetUrl(username, tweetId)
            );

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

          console.log(
            '[game]',
            'job completed',
            getTweetUrl(username, tweetId)
          );

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


          console.log(
            '[game]',
            'job rejected',
            getTweetUrl(username, tweetId)
          );

          return;
        }

      });

    });
};

// Reporting
const report = () => {
  let allThreads = [];
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
    let username = tweetUsernameById[threadId];
    let thread = {
      startTime,
      endTime,
      url: getTweetUrl(username, threadId),
      leadTime: undefined
    };
    allThreads.push(thread);

    if (endTime) {
      let leadTime = (endTime - startTime) / 1000;
      let usernames = collectUsernames(threadEnd);
      let teamId = usernames.join('-');
      let teamLeadTimes = leadTimesByTeamId[teamId] || [];
      thread.leadTime = leadTime;
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
  let leadTimeReduced = {
    min: _.min(leadTimes),
    max: _.max(leadTimes),
    avg: _.mean(leadTimes) || undefined
  };

  if (leadTimeReduced.min !== undefined) {
    leadTimeReduced.min = Math.round(leadTimeReduced.min);
  }
  if (leadTimeReduced.max !== undefined) {
    leadTimeReduced.max = Math.round(leadTimeReduced.max);
  }
  if (leadTimeReduced.avg !== undefined) {
    leadTimeReduced.avg = Math.round(leadTimeReduced.avg);
  }


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
      Math.pow(tasksDoneNumber, 2) * 1000000 /
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

  scores = _.sortBy(scores, (score) => -score.points);
  _.forEach(scores, (score, index) => {
    score.place = index + 1;
  });

  api.broadcast(JSON.stringify({
    hashtag: gameHashtag,
    participantsNumber: Object.keys(usernameByUserId).length,
    tasksInProgressNumber: inventory,
    tasksDoneNumber: done,
    poInProgressNumber: inventoryByWorkCenter[WORK_CENTER_PO],
    devInProgressNumber: inventoryByWorkCenter[WORK_CENTER_DEV],
    qaInProgressNumber: inventoryByWorkCenter[WORK_CENTER_QA],
    poLeadTime: leadTimesByWorkCenterReduced[WORK_CENTER_PO].avg,
    devLeadTime: leadTimesByWorkCenterReduced[WORK_CENTER_DEV].avg,
    qaLeadTime: leadTimesByWorkCenterReduced[WORK_CENTER_QA].avg,
    scoreboardData: scores,
    systemLeadTime: leadTimeReduced,
    allThreads: _.sort(allThreads, (t) => t.startTime)
  }));

  setTimeout(report, REPORTING_INTERVAL);

  // console.log('System lead times', leadTimeReduced);
  // console.log('Work center lead times', leadTimesByWorkCenterReduced);
  // console.log('Inventory', inventory, 'Defects', defects);
  // console.log('Inventory by work center', inventoryByWorkCenter);
  // console.log('==============================\n');
};

const startReporting = report;


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


const getNotificationText = (tweetIdStr, type) => {
  const texts = NOTIFICATION_TEXT_BY_TYPE[type];
  const textIndex =  Number(tweetIdStr) % texts.length;
  return texts[textIndex];
}


// Notifications
const notify = async () => {
  let retryNotifications = [];

  if (notifications.length === 0) {
    return;
  }

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

      const body = getNotificationText(
        lastTweetId,
        NOTIFICATION_TASK_COMPLETED
      );

      const text = (
        `${usernamesStr} ${body} ${leadTime}s ` +
        getTweetUrl(qaUsername, lastTweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {status: text})
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }


    if (notification.type === NOTIFICATION_FOR_PO) {
      const poList = usersByCategory.po;
      const poIndex = (
        Math.round(Math.random() * 1000) % poList.length
      );

      const poId = poList[poIndex];

      if (!poId) {
        retryNotifications.push(notification);
        continue;
      }

      const poUsername = usernameByUserId[poId];
      const tweetId = notification.tweetId;
      const customerUsername = tweetUsernameById[tweetId];


      const body = getNotificationText(
        tweetId,
        NOTIFICATION_FOR_PO
      );
      const text = (
        `@${poUsername} ${body} ` +
        getTweetUrl(customerUsername, tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {status: text});
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }


    if (notification.type === NOTIFICATION_FOR_DEV_NEW) {
      const devList = usersByCategory.dev;
      const devIndex = (
        Math.round(Math.random() * 1000) % devList.length
      );

      const devId = devList[devIndex];

      if (!devId) {
        retryNotifications.push(notification);
        continue;
      }

      const devUsername = usernameByUserId[devId];
      const tweetId = notification.tweetId;
      const poUsername = tweetUsernameById[tweetId];

      const body = getNotificationText(
        tweetId,
        NOTIFICATION_FOR_DEV_NEW
      );
      const text = (
        `@${devUsername} ${body} ` +
        getTweetUrl(poUsername, tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {status: text});
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }


    if (notification.type === NOTIFICATION_FOR_DEV_REJECTED) {
      const devUsername = notification.devUsername;
      const tweetId = notification.tweetId;
      const qaUsername = tweetUsernameById[tweetId];


      const body = getNotificationText(
        tweetId,
        NOTIFICATION_FOR_DEV_REJECTED
      );
      const text = (
        `@${devUsername} ${body}` +
        getTweetUrl(qaUsername, tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {status: text});
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }


    if (notification.type === NOTIFICATION_FOR_QA) {
      const qaList = usersByCategory.qa;
      const qaIndex = (
        Math.round(Math.random() * 1000) % qaList.length
      );

      const qaId = qaList[qaIndex];

      if (!qaId) {
        retryNotifications.push(notification);
        continue;
      }

      const qaUsername = usernameByUserId[qaId];
      const tweetId = notification.tweetId;
      const devUsername = tweetUsernameById[tweetId];

      const body = getNotificationText(
        tweetId,
        NOTIFICATION_FOR_QA
      );
      const text = (
        `@${qaUsername} ${body} ` +
        getTweetUrl(devUsername, tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {status: text});
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }

    if (notification.type === NOTIFICATION_USER_JOINED) {
      const body = getNotificationText(
        notification.tweetId,
        NOTIFICATION_USER_JOINED
      );

      const text = (
        `@${notification.username} ` +
        `${body} ${notification.category.toUpperCase()} ` +
        getTweetUrl(notification.username, notification.tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {
          status: text
        });
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }

    if (notification.type === NOTIFICATION_USER_LEFT) {
      const body = getNotificationText(
        notification.tweetId,
        NOTIFICATION_USER_LEFT
      );

      const text = (
        `@${notification.username} ${body} ` +
        getTweetUrl(notification.username, notification.tweetId)
      );

      console.log('sending', text);

      try {
        await client.post('statuses/update', {
          status: text
        });
      } catch (err) {
        console.error('Can\'t send notification', text, err);
      }
    }
  }

  notifications = retryNotifications;

  setTimeout(notify, NOTIFICATIONS_INTERVAL);
};

const startNotifying = notify;



setTimeout(writeBackup, BACKUP_INTERVAL);

async function writeBackup() {
  const dataPath = BACKUP_PATH;
  const dirPath = path.dirname(dataPath);

  try {
    console.log('[backup]', 'saving backup to', dataPath);
    await fs.mkdirs(dirPath);
    await fs.access(dirPath, fs.constants.W_OK | fs.constants.X_OK)
    await fs.writeJson(dataPath, {
      tweetThreads: [...tweetThreads],
      tweetTimeById,
      tweetParentById,
      tweetThreadById,
      threadEndById,
      tweetTypeById,
      threadStatusById,
      tweetUsernameById,
      notifications,
      usersByCategory,
      categoryByUserId,
      usernameByUserId,
      gameHashtag
    });
    console.log('[backup]', 'backup done');
  } catch (e) {
    console.warn('[backup]', `can't write backup at:`, dataPath, e);
  } finally {
    setTimeout(writeBackup, BACKUP_INTERVAL);
  }
};


async function readBackupIntoMemory() {
  const dataPath = BACKUP_PATH;
  try {
    await fs.access(dataPath, fs.constants.R_OK)
  } catch (e) {
    console.warn('[backup]', `can't read backup at:`, dataPath);
    return;
  }

  let data = await fs.readJson(dataPath);

  tweetThreads = new Set(data.tweetThreads);
  tweetTimeById = data.tweetTimeById;
  tweetParentById = data.tweetParentById;
  tweetThreadById = data.tweetThreadById;
  threadEndById = data.threadEndById;
  tweetTypeById = data.tweetTypeById;
  threadStatusById = data.threadStatusById;
  tweetUsernameById = data.tweetUsernameById;
  notifications = data.notifications;
  usersByCategory = data.usersByCategory;
  categoryByUserId = data.categoryByUserId;
  usernameByUserId = data.usernameByUserId;
  gameHashtag = data.gameHashtag;

  console.log('[backup]', 'restored state from backup');
  return;
};


const doRestart = () => {
  if (restartWatcher) {
    console.log('[doRestart]', 'restarting watcher');
    restartWatcher = false;
    startWatching();
  }

  setTimeout(doRestart, WATCHER_RESTART_INTERVAL);
};

setTimeout(doRestart, WATCHER_RESTART_INTERVAL);

readBackupIntoMemory()
  .then(() => {
    startWatching();
    startReporting();
    startNotifying();
  })
  .catch((e) => {
    console.error('[main] something went wrong', e);
    process.exit(1);
  });
