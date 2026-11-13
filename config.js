const _ = require('lodash')
const dotenv = require('dotenv')

// load dotenv config vars if available
dotenv.config()

const config = {
  PUBLIC_URL: 'https://data.news.mickschroeder.com',
  AWS_BUCKET: 'popular-news-sites',
  AWS_REGION: 'us-east-1',
  AWS_KEY: '',
  AWS_SECRET: '',
  CLOUDFRONT_DISTRIBUTION_ID: '',
  ANTHROPIC_API_KEY: '',
  ANTHROPIC_MODEL: 'claude-sonnet-5-5',
  RETIRE_AFTER_DAYS: 90
}

module.exports = _.pick(_.assign({}, config, process.env), _.keys(config))
