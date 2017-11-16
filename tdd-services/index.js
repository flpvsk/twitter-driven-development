require('dotenv').config();
const _ = require('lodash');
const util = require('util');
const Twitter = require('twitter');
const emojiRegex = require('emoji-regex')();
const api = require('./api');
const data = require('./data');

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
/*
const tweetThreads = new Set();
const tweetTimeById = {};
const tweetParentById = {};
const tweetThreadById = {};
const threadEndById = {};
const tweetTypeById = {};
const threadStatusById = {};
const tweetUsernameById = {};
const notifications = [];
*/

// State (users)

const ADMIN_ID = '929069070892355585';// '171462019';
const SELF_ID = '929069070892355585';
const SELF_USERNAME = 'mngr999';

/*
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

let usernameByUserId = {
  // '929069070892355585': 'mngr999',
  // '171462019': 'flpvsk'
};

*/

// State (game)

let globalStream;

const watch = () => {
  startWatching()
    .catch(e => {
      console.log('Error in watcher', e);
      process.exit(1);
    });
};

const startWatching = async function startWatching() {
  globalStream && globalStream.destroy();

  const usersToFollow = await data.usernameByUserId.getUserIdSet();
  const gameHashtag = await data.currentGameHashtag.get();
  const isGameHashTag = (htObj) => htObj.text === gameHashtag;
  const queryObj = {
    track: `@${SELF_USERNAME}`,
    follow: `${usersToFollow.join(',')}`
  };

  client.stream('statuses/filter', queryObj, (stream) => {
    globalStream = stream;

    stream.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });

    stream.on('data', async (msg) => {
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
        await data.currentGameHashTag.set(msg.entities.hashtags[0].text);

        console.log('Starting a game with', gameHashtag);
        watch();
        return;
      }

      const hasUserJoined = await data.usernameByUserId.has(
        msg.user.id_str
      );

      // Adding user
      if (
        !hasUserJoined &&
        msg.text.toLowerCase().indexOf('join') > -1
      ) {
        const userId = msg.user.id_str;

        let userCategory = _.find(USER_CATEGORIES, (cat) => {
          return msg.text.toLowerCase().indexOf(cat) > -1;
        });

        const usersNumber = await data.usernameByUserId.getSize();
        const userCategoryIndex = usersNumber % USER_CATEGORIES.length;

        userCategory = userCategory || USER_CATEGORIES[userCategoryIndex];

        const username = msg.user.screen_name;

        await data.usernameByUserId.set(userId, username);
        await data.usersByCategory.add(userCategory, userId);
        await data.notifications.push({
          type: NOTIFICATION_USER_JOINED,
          userId,
          username,
          category: userCategory
        });

        console.log('user joined', userId, userCategory);
        watch();
        return;
      }


      // Removing user
      if (
        hasUserJoined &&
        msg.text.toLowerCase().indexOf('leave') > -1
      ) {
        const userId = msg.user.id_str;
        const username = msg.user.screen_name;

        await data.usernameByUserId.remove(userId);
        await data.usersByCategory.removeFromAll(userId);

        await data.notifications.push({
          type: NOTIFICATION_USER_LEFT,
          userId,
          username,
          category
        });

        console.log('user left', userId, category);
        return;
      }

      // During-game actions
      const userId = msg.user.id_str;
      const username = msg.user.screen_name;
      const tweetId = msg.id_str;
      const parentId = msg.in_reply_to_status_id_str;
      const timestamp = parseInt(msg.timestamp_ms);
      const [
        isCustomer,
        isPO,
        isDev,
        isQA,
        doesThreadExist
      ] = await Promise.all([
        data.usersByCategory.has('customer', userId),
        data.usersByCategory.has('po', userId),
        data.usersByCategory.has('dev', userId),
        data.usersByCategory.has('qa', userId),
        data.tweetThreads.has(gameHashtag, tweetId)
      ]);

      // 1. Customer tweets something with a hashtag: C1
      if (
        isCustomer  &&
        _.some(msg.entities.hashtags, isGameHashTag) &&
        !doesThreadExist &&
        !parentId
      ) {

        await data.indexTweet({
          gameId: gameHashtag,
          tweet: msg,
          newThreadStatus: WORK_CENTER_PO,
          tweetType: TWEET_CUSTOMER,
          threadId: tweetId
        });

        await data.notifications.push({
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


      const parentTweetType = await data.tweetTypeById.get(
        gameHashtag,
        parentId
      );
      const isThreadFinished = await data.threadEndById.get(
        gameHashtag,
        parentId
      );

      // 2. PO replies to C1 with a gif: P1
      if (
        isPO &&
        hasGif(msg) &&
        parentTweetType === TWEET_CUSTOMER &&
        !isThreadFinished
      ) {

        await data.indexTweet({
          gameId: gameHashtag,
          tweet: msg,
          newThreadStatus: WORK_CENTER_DEV,
          tweetType: TWEET_PO,
          threadId: parentId
        });

        await data.notifications.push({
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
        parentTweetType === TWEET_PO ||
        parentTweetType === TWEET_QA_REJECTED
      );

      // 3. DEV replies to P1 with emoji
      if (
        isDev &&
        emojiRegex.test(msg.text) &&
        hasDevOrQATweetParent
      ) {
        const threadId = await data.tweetThreadById(
          gameHashtag,
          parentId
        );
        const isThreadFinished = await data.threadEndById.get(
          gameHashtag,
          threadId
        );

        if (!isThreadFinished) {
          await data.indexTweet({
            gameId: gameHashtag,
            tweet: msg,
            newThreadStatus: WORK_CENTER_QA,
            tweetType: TWEET_DEV,
            threadId
          });

          console.log(
            '[game]',
            'job moved to QA',
            getTweetUrl(username, tweetId)
          );

          await data.notifications.push({
            type: NOTIFICATION_FOR_QA,
            tweetId: tweetId
          });

          return;
        }
      }


      // 4. QA approving
      if (
        isQA &&
        parentTweetType === TWEET_DEV &&
        isPositiveAnswer(msg.text)
      ) {
        const threadId = await data.tweetThreadById(
          gameHashtag,
          parentId
        );
        const isThreadFinished = await data.threadEndById.get(
          gameHashtag,
          threadId
        );

        if (isThreadFinished) {
          return;
        }

        await Promise.all([
          data.indexTweet({
            gameId: gameHashtag,
            tweet: msg,
            newThreadStatus: DONE,
            tweetType: TWEET_QA_APPROVED,
            threadId
          }),
          data.threadEndById.set(gameHashtag, threadId, tweetId),
          data.notifications.push({
            type: NOTIFICATION_TASK_COMPLETED,
            threadId: threadId,
            lastTweetId: tweetId
          })
        ]);

        console.log(
          '[game]',
          'job completed',
          getTweetUrl(username, tweetId)
        );

        return;
      }


      // 4. QA rejecting
      if (
        isQA &&
        parentTweetType === TWEET_DEV &&
        !isPositiveAnswer(msg.text)
      ) {
        const threadId = await data.tweetThreadById(
          gameHashtag,
          parentId
        );
        const isThreadFinished = await data.threadEndById.get(
          gameHashtag,
          threadId
        );

        if (isThreadFinished) {
          return;
        }

        const devUsername = await data.tweetUsernameById.get(
          gameHashtag,
          parentId
        );

        await Promise.all([
          data.indexTweet({
            gameId: gameHashtag,
            tweet: msg,
            newThreadStatus: WORK_CENTER_DEV,
            tweetType: TWEET_QA_REJECTED,
            threadId
          }),
          data.notifications.push({
            type: NOTIFICATION_FOR_DEV_REJECTED,
            tweetId: tweetId,
            devUsername
          })
        ]);

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
  startReporting()
    .catch(e => {
      console.error('Error in reporter', e);
      process.exit(1);
    });
};

const startReporting = async () => {
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


  const gameHashtag = await data.currentGameHashtag.get();
  const tweetThreads = await data.tweetThreads.list(gameHashtag);

  for (let threadId of tweetThreads) {
    let startTime = await data.tweetTimeById(gameHashtag, threadId);
    let threadEnd = await data.threadEndById(gameHashtag, threadId);
    let endTime;

    if (threadEnd) {
      endTime = await data.tweetTimeById.get(gameHashtag, threadEnd);
    }

    if (endTime) {
      let leadTime = (endTime - startTime) / 1000;
      let usernames = await collectUsernames(gameHashtag, threadEnd);
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
      const threadStatus = await data.threadStatusById.get(
        gameHashtag,
        threadId
      );
      inventory += 1;
      inventoryByWorkCenter[threadStatus] += 1;
    }
  }

  const tweetsByParent = await data.tweetParentById.entries(gameHashtag);
  for (let [tweetId, parentId] of tweetsByParent) {
    const tweetType = await data.tweetTypeById.get(gameHashtag, tweetId);
    const workCenter = WORK_CENTER_BY_TWEET_TYPE[tweetType];
    const [
      tweetTime,
      parentTime
    ] = await Promise.all([
      data.tweetTimeById.get(gameHashtag, tweetId),
      data.tweetTimeById.get(gameHashtag, parentId)
    ]);

    leadTimesByWorkCenter[workCenter].push(
      (tweetTime - parentTime) / 1000
    );
  }


  const tweetsByType = await data.tweetTypeById.entries(gameHashtag);
  // number of deffects
  for (let [tweetId, type] of tweetsByType) {
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

  scores = _.sortBy(scores, (score) => score.points);
  _.forEach(scores, (score, index) => {
    score.place = index + 1;
  });

  const participantsNumber = await data.usernameByUserId.getSize();
  api.broadcast(JSON.stringify({
    hashtag: gameHashtag,
    participantsNumber,
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

  setTimeout(report, 1000);
};


const collectUsernames = async (gameId, lastTweetId) => {
  let usernames = new Set();

  usernames.add(await data.tweetUsernameById.get(gameId, lastTweetId));
  let parentId = await tweetParentById.get(gameId, lastTweetId);

  while (parentId) {
    let tweetId = parentId;
    parentId = await tweetParentById.get(gameId, tweetId);
    usernames.add(await tweetUsernameById.get(gameId, tweetId));
  }

  return [...usernames];
};

const notify = () => {
  startNotifying()
    .catch(e => {
      console.error('Error in notifier', e);
      process.exit(1);
    });
};

// Notifications
const startNotifying = async () => {
  const gameHashtag = await data.currentGameHashtag.get();
  let notification = await data.notifications.pop();

  while (notification) {

    if (notification.type === NOTIFICATION_TASK_COMPLETED) {
      const threadId = notification.threadId;
      const lastTweetId = notification.lastTweetId;

      const [
        usernames,
        qaUsername,
        lastTweetTime,
        firstTweetTime
      ] = await Promise.all([
        collectUsernames(gameHashtag, lastTweetId),
        data.tweetUsernameById(gameHashtag, lastTweetId),
        data.tweetTimeById.get(gameHashtag, lastTweetId),
        data.tweetTimeById.get(gameHashtag, threadId)
      ]);

      const usernamesStr = usernames.map(u => `@${u}`).join(' ');
      const leadTime = Math.round((lastTweetTime - firstTweetTime) / 1000);

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
      const tweetId = notification.tweetId;

      const [
        poListSize,
        tweetThreadsSize,
        customerUsername
      ] = await Promise.all([
        data.usersByCategory.getSize('po'),
        data.tweetThreads.getSize(gameHashtag),
        data.tweetUsernameById.get(gameHashtag, tweetId)
      ]);

      const poIndex = (
        tweetThreadsSize % poListSize
      );

      const poId = await data.usersByCategory.getUserIdByIndex(
        'po',
        poIndex
      );
      const poUsername = await data.usernameByUserId.get(poId);

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
      const tweetId = notification.tweetId;

      const [
        devListSize,
        tweetThreadsSize,
        poUsername
      ] = await Promise.all([
        data.usersByCategory.getSize('dev'),
        data.tweetThreads.getSize(gameHashtag),
        data.tweetUsernameById.get(gameHashtag, tweetId)
      ]);

      const devIndex = tweetThreadsSize % devListSize;

      const devId = await data.usersByCategory.getUserIdByIndex(
        'dev',
        devIndex
      );
      const devUsername = await data.usernameByUserId.get(devId);

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
      const qaUsername = await data.tweetUsernameById.get(
        gameHashtag,
        tweetId
      );

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
      const tweetId = notification.tweetId;

      const [
        qaListSize,
        tweetThreadsSize,
        devUsername
      ] = await Promise.all([
        data.usersByCategory.getSize('qa'),
        data.tweetThreads.getSize(gameHashtag),
        data.tweetUsernameById.get(gameHashtag, tweetId)
      ]);

      const qaIndex = tweetThreadsSize % qaListSize;
      const qaId = await data.usersByCategory.getUserIdByIndex(
        'qa',
        qaIndex
      );
      const qaUsername = await data.usernameByUserId.get(qaId);

      const text = (
        `@${qaUsername} Check out this implementation from a developer. ` +
        `Reply to the tweet referenced below with ` +
        `"approved" or "rejected" ` +
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
        `We do hope that you'll return all the pens ` +
        `you took home from the office.`
      );

      console.log('sending', text);

      client
        .post('statuses/update', {status: text})
        .catch((err) => {
          console.error('Can\'t send notification', text, err);
        });
    }


    notification = await data.notifications.pop();
  }

  setTimeout(notify, 1000);
};


watch();
notify();
report();

