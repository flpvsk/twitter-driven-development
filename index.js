require('dotenv').config();
const _ = require('lodash');
const util = require('util');
const Twitter = require('twitter');
const emojiRegex = require('emoji-regex')();

const isTweet = _.conforms({
  id_str: _.isString,
  text: _.isString,
  user: _.isObject
});

const WORK_CENTER_PO = 'po';
const WORK_CENTER_DEV = 'dev';
const WORK_CENTER_QA = 'qa';
const DONE = 'done';

const QA_APPROVED = 'approved';
const QA_REJECTED = 'rejected';

const customerList = [
  '929069070892355585'
];

const poList = [
  '929069070892355585'
];

const devList = [
  '929069070892355585'
];

const qaList = [
  '929069070892355585'
];

const customerSet = new Set(customerList);
const poSet = new Set(poList);
const devSet = new Set(devList);
const qaSet = new Set(qaList);


const gameHashTag = 'yo';

const isGameHashTag = (htObj) => htObj.text === gameHashTag;

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

const qaDidApprove = (customerTweetId, answers) => {
  return _.some(answers[customerTweetId], (a) => a === QA_APPROVED);
};

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});

client.stream( 'statuses/filter',
  {follow: `171462019,${qaList[0]}`},
  (stream) => {
    const workCenter = {};
    const poToCustomerTweet = {};
    const devToCustomerTweet = {};
    const qaToCustomerTweet = {};
    const qaAnswers = {};

    stream.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });


    stream.on('data', (msg) => {
      const str = util.inspect(msg, {depth: null});
      if (!isTweet(msg)) {
        console.warn('Not a tweet', str);
        return;
      }
      console.log(msg.text);

      const userId = msg.user.id_str;


      // 1. Customer tweets something with a hashtag: C1
      if (
        customerSet.has(userId) &&
        _.some(msg.entities.hashtags, isGameHashTag) &&
        !msg.in_reply_to_status_id_str
      ) {
        workCenter[msg.id_str] = WORK_CENTER_PO;
        console.log('workCenter', workCenter);
        return;
      }

      const parentTweetId = msg.in_reply_to_status_id_str;

      // 2. PO replies to C1 with a gif: P1
      if (
        poSet.has(userId) &&
        hasGif(msg) &&
        !!workCenter[parentTweetId]
      ) {
        workCenter[parentTweetId] = WORK_CENTER_DEV;
        poToCustomerTweet[msg.id_str] = parentTweetId;
        console.log('workCenter', workCenter);
        return;
      }

      const hasDevOrQATweetParent = (
        !!poToCustomerTweet[parentTweetId] ||
        !!qaToCustomerTweet[parentTweetId]
      );

      console.log(
        'before dev',
        (devSet.has(userId) &&
        emojiRegex.test(msg.text) &&
        hasDevOrQATweetParent),
        devSet.has(userId),
        emojiRegex.test(msg.text),
        hasDevOrQATweetParent,
        !!poToCustomerTweet[parentTweetId],
        !!qaToCustomerTweet[parentTweetId],
        parentTweetId
      );

      // 3. DEV replies to P1 with emoji
      if (
        devSet.has(userId) &&
        emojiRegex.test(msg.text) &&
        hasDevOrQATweetParent
      ) {
        console.log('in dev');
        const customerTweetId = (
          poToCustomerTweet[parentTweetId] ||
          qaToCustomerTweet[parentTweetId]
        );

        devToCustomerTweet[msg.id_str] = customerTweetId;

        if (!qaDidApprove(customerTweetId, qaAnswers)) {
          workCenter[customerTweetId] = WORK_CENTER_QA;
          console.log('workCenter', workCenter);
          return;
        }
      }


      // 4. QA approving
      if (
        qaSet.has(userId) &&
        !!devToCustomerTweet[parentTweetId] &&
        isPositiveAnswer(msg.text)
      ) {
        const customerTweetId = devToCustomerTweet[parentTweetId];
        workCenter[customerTweetId] = DONE;
        qaAnswers[customerTweetId] = qaAnswers[customerTweetId] || [];
        qaAnswers[customerTweetId].push(QA_APPROVED);
        console.log('workCenter', workCenter, qaAnswers);
        return;
      }


      // 4. QA rejecting
      if (
        qaSet.has(userId) &&
        !!devToCustomerTweet[parentTweetId] &&
        !isPositiveAnswer(msg.text)
      ) {
        const customerTweetId = devToCustomerTweet[parentTweetId];
        qaAnswers[customerTweetId] = qaAnswers[customerTweetId] || [];
        qaAnswers[customerTweetId].push(QA_REJECTED);

        if (qaDidApprove(customerTweetId, qaAnswers)) {
          console.log('workCenter', workCenter);
          return;
        }

        workCenter[customerTweetId] = WORK_CENTER_DEV;
        console.log('workCenter', workCenter, qaAnswers);
        return;
      }

    });

  });


