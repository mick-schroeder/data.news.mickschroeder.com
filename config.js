const _ = require('lodash')
// Load .env when present.
try { process.loadEnvFile() } catch {}

const config = {
  PUBLIC_URL: 'https://data.news.mickschroeder.com',
  AWS_BUCKET: 'popular-news-sites',
  AWS_REGION: 'us-east-1',
  AWS_KEY: '',
  AWS_SECRET: '',
  CLOUDFRONT_DISTRIBUTION_ID: '',
  ANTHROPIC_MODEL: 'claude-sonnet-5-5',
  RETIRE_AFTER_DAYS: 90,
  RETIRE_PER_RUN: 20,
  MIN_FEED_LINKS: 20
}

module.exports = _.pick(_.assign({}, config, process.env), _.keys(config))
