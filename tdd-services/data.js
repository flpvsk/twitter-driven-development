const redis = require('redis');
const util = require('util');
const _ = require('lodash');
const bluebird = require('bluebird');


const GAME_PREFIX = 'tdd:games';
const USER_PREFIX = 'tdd:users';
const NOTIFICATION_PREFIX = 'tdd:notifications';

const USER_CATEGORIES = [
  'customer',
  'po',
  'dev',
  'qa'
];

const RC = redis.RedisClient.prototype;
const M = redis.Multi.prototype;


RC.sadd = util.promisify(RC.sadd);
RC.srem = util.promisify(RC.srem);
RC.smembers = util.promisify(RC.smembers);
RC.sismember = util.promisify(RC.sismember);
RC.scard = util.promisify(RC.scard); // returns size of the set
RC.hset = util.promisify(RC.hset);
RC.hget = util.promisify(RC.hget);
RC.hlen = util.promisify(RC.hlen);
RC.hgetall = util.promisify(RC.hgetall);
RC.hexists = util.promisify(RC.hexists);
RC.hkeys = util.promisify(RC.hkeys);
RC.hdel = util.promisify(RC.hdel);
RC.rpush = util.promisify(RC.rpush);
RC.lrange = util.promisify(RC.lrange);
RC.lrem = util.promisify(RC.lrem);
RC.lpop = util.promisify(RC.lpop);
RC.lindex = util.promisify(RC.lindex);
RC.set = util.promisify(RC.set);
RC.get = util.promisify(RC.get);

M.sadd = util.promisify(M.sadd);
M.srem = util.promisify(M.srem);
M.smembers = util.promisify(M.smembers);
M.sismember = util.promisify(M.sismember);
M.scard = util.promisify(M.scard); // returns size of the set
M.hset = util.promisify(M.hset);
M.hget = util.promisify(M.hget);
M.hlen = util.promisify(M.hlen);
M.hgetall = util.promisify(M.hgetall);
M.hexists = util.promisify(M.hexists);
M.hkeys = util.promisify(M.hkeys);
M.hdel = util.promisify(M.hdel);
M.rpush = util.promisify(M.rpush);
M.lrange = util.promisify(M.lrange);
M.lrem = util.promisify(M.lrem);
M.lpop = util.promisify(M.lpop);
M.lindex = util.promisify(M.lindex);
M.set = util.promisify(M.set);
M.get = util.promisify(M.get);


const client = redis.createClient();
client.on('error', (err) => {
  console.error('Error connecting to redis', err);
  process.exit(1);
});


const getThreadsKey = (gameId) => `${GAME_PREFIX}:${gameId}:threads`;

const tweetThreads = {
  list: async function list(gameId) {
    return client.smembers(getThreadsKey(gameId));
  },

  add: async function add(gameId, id) {
    return client.sadd(getThreadsKey(gameId), id);
  },

  has: async function has(gameId, id) {
    let resultNumber = await client.sismember(getThreadsKey(gameId), id);
    return Boolean(resultNumber);
  },

  getSize: async function getSize(gameId) {
    const s = await client.scard(getThreadsKey(gameId));
    return Number(s);
  }
};


const getTimeKey = gameId => `${GAME_PREFIX}:${gameId}:tweetTimeById`;
const tweetTimeById = {
  set: async function set(gameId, tweetId, time) {
    return client.hset(getTimeKey(gameId), tweetId, time);
  },

  get: async function get(gameId, tweetId) {
    return client.hget(getTimeKey(gameId), tweetId)
      .then(x => Number(x));
  }
};


const getParentKey = gameId => `${GAME_PREFIX}:${gameId}:tweetParentById`;
const tweetParentById = {
  set: async function set(gameId, tweetId, parentId) {
    return client.hset(getParentKey(gameId), tweetId, parentId);
  },

  get: async function get(gameId, tweetId) {
    return client.hget(getParentKey(gameId), tweetId);
  },

  entries: async function entries(gameId) {
    return client.hgetall(getParentKey(gameId))
      .then(arr => _.toPairs(arr, 2));
  }
};


const getThreadKey = gameId => `${GAME_PREFIX}:${gameId}:tweetThreadById`;
const tweetThreadById = {
  set: async function set(gameId, tweetId, threadId) {
    return client.hset(getThreadKey(gameId), tweetId, threadId);
  },

  get: async function get(gameId, tweetId) {
    return client.hget(getThreadKey(gameId), tweetId);
  }
};



const getThreadEndKey = gameId => (
  `${GAME_PREFIX}:${gameId}:threadEndById`
);
const threadEndById = {
  set: async function set(gameId, threadId, tweetId) {
    return client.hset(getThreadEndKey(gameId), threadId, tweetId);
  },

  get: async function get(gameId, threadId) {
    return client.hget(getThreadEndKey(gameId), threadId);
  },

  has: async function has(gameId, threadId) {
    return client.hexists(getThreadEndKey(gameId), threadId)
      .then(n => Boolean(n));
  }
};


const getTypeKey = gameId => `${GAME_PREFIX}:${gameId}:tweetTypeById`;
const tweetTypeById = {

  set: async function set(gameId, tweetId, type) {
    return client.hset(getTypeKey(gameId), tweetId, type);
  },

  get: async function get(gameId, tweetId) {
    return client.hget(getTypeKey(gameId), tweetId);
  },

  entries: async function entries(gameId) {
    return client.hgetall(getTypeKey(gameId))
      .then(arr => _.toPairs(arr, 2));
  }
};


const getThreadStatusKey = gameId => (
  `${GAME_PREFIX}:${gameId}:threadStatusById`
);
const threadStatusById = {
  set: async function set(gameId, threadId, status) {
    return client.hset(getThreadStatusKey(gameId), threadId, status);
  },

  get: async function get(gameId, threadId) {
    return client.hget(getThreadStatusKey(gameId), threadId);
  }
};


const getUsernameKey = gameId => (
  `${GAME_PREFIX}:${gameId}:tweetUsernameById`
);
const tweetUsernameById = {
  set: async function set(gameId, tweetId, username) {
    return client.hset(getUsernameKey(gameId), tweetId, username);
  },

  get: async function get(gameId, tweetId) {
    return client.hget(getUsernameKey(gameId), tweetId);
  }
};


const getNotificationsKey = () => `${NOTIFICATION_PREFIX}`;
const notifications = {
  pop: async function pop() {
    const data = await client.lpop(getNotificationsKey());
    if (!data) {
      return data;
    }
    return JSON.parse(data);
  },

  push: async function push(notification) {
    return client.rpush(
      getNotificationsKey(),
      JSON.stringify(notification)
    );
  }
};


const getUsersByCategoryKey = (category) => {
  `${USER_PREFIX}:categories:${category}`
};
const getCategorySetKey = (category) => {
  `${USER_PREFIX}:categorySet:${category}`
};

const usersByCategory = {
  add: async function add(category, userId) {
    console.log('xxx adding user by cat', category, userId);
    return client
      .multi()
      .rpush(getUsersByCategoryKey(category), userId)
      .sadd(getCategorySetKey(category), userId)
      .execAsync();
  },

  has: async function has(category, userId) {
    return client.sismember(getCategorySetKey(category), userId)
      .then(n => Boolean(n));
  },

  remove: async function remove(userId, category) {
    return client
      .multi()
      .lrem(getUsersByCategoryKey(category), 0, userId)
      .srem(getCategorySetKey(category), userId)
      .execAsync();
  },

  removeFromAll: async function removeFromAll(userId) {
    let cmd = client.multi();

    for (let category of USER_CATEGORIES) {
      cmd = cmd
        .lrem(getUsersByCategoryKey(category), 0, userId)
        .srem(getCategorySetKey(category), userId);
    }

    return cmd.execAsync();
  },

  getSize: async function getSize(category) {
    return client.scard(getUsersByCategoryKey(category))
      .then(s => Number(s));
  },

  getUserIdByIndex: async function getUserIdByIndex(category, index) {
    return client.lindex(getUsersByCategoryKey(category), index);
  }
};


const getUsernameByUserIdKey = () => {
  return `${USER_PREFIX}:usernameByUserId`;
};

const usernameByUserId = {
  get: async function get(userId) {
    return client.hget(getUsernameByUserIdKey(), userId);
  },

  set: async function set(userId, username) {
    return client.hset(getUsernameByUserIdKey(), userId, username);
  },

  remove: async function remove(userId) {
    return client.hdel(getUsernameByUserIdKey(), userId);
  },

  has: async function has(userId) {
    return client.hexists(getUsernameByUserIdKey(), userId)
      .then(n => Boolean(n));

  },

  getSize: async function getSize() {
    const s = await client.hlen(getUsernameByUserIdKey());
    return Number(s);
  },

  getUserIdSet: async function getUserIdSet() {
    return client.hkeys(getUsernameByUserIdKey());
  }
};


const getCurrentGameKey = () => {
  return 'tdd:currentGame';
};

const currentGameHashtag = {
  get: async function get() {
    return client.get(getCurrentGameKey());
  },

  set: async function set(hashtag) {
    return client.set(getCurrentGameKey(), hashtag);
  }
};


const indexTweet = ({
  gameId,
  tweet,
  tweetType,
  threadId,
  newThreadStatus
}) => {
  const userId = tweet.user.id_str;
  const username = tweet.user.screen_name;
  const tweetId = tweet.id_str;
  const parentId = tweet.in_reply_to_status_id_str;
  const timestamp = parseInt(tweet.timestamp_ms);

  let multi = client
    .multi()
    .hset(getTimeKey(gameId), tweetId, timestamp)
    .hset(getTypeKey(gameId), tweetId, tweetType)
    .hset(getUsernameKey(gameId), tweetId, username)
    .hset(getParentKey(gameId), tweetId, parentId)
    .hset(getThreadKey(gameId), tweetId, threadId);

  if (newThreadStatus) {
    multi = multi.hset(
      getThreadStatusKey(gameId),
      threadId,
      newThreadStatus
    );
  }

  return multi.execAsync();
};


module.exports = {
  tweetThreads,
  tweetTimeById,
  tweetParentById,
  tweetThreadById,
  threadEndById,
  tweetTypeById,
  threadStatusById,
  tweetUsernameById,
  usernameByUserId,
  notifications,
  usersByCategory,
  currentGameHashtag,
  indexTweet
};

