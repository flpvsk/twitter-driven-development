require('dotenv').config();
const Twitter = require('twitter');

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

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});


client.stream(
  'statuses/filter',
  {follow: `171462019,${qaList[0]}`},
  (stream) => {

    stream.on('error', (err) => {
      console.error(err);
      process.exit(1);
    });


    stream.on('data', (msg) => {
      console.log(msg.text);
    });

  });


