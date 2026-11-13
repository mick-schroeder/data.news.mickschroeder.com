const { getDomain } = require('tldts')

const isWebUrl = function (url) {
  return URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol)
}

const hostOf = function (url) {
  return new URL(url).hostname.replace(/^www\./, '')
}

// Same site: same host (without www) and path; /home/index.html is /home.
const urlKey = function (url) {
  return hostOf(url) + new URL(url).pathname.replace(/\/index\.(html?|php)$/i, '').replace(/\/+$/, '')
}

// online.wsj.com -> wsj.com
const domainOf = function (url) {
  return getDomain(url) || hostOf(url)
}

const homepageOf = function (url) {
  return `https://${new URL(url).hostname}/`
}

// https, no query or hash; article links become the homepage.
const siteUrl = function (url) {
  const parsed = new URL(url)
  if (/\/(19|20)\d\d\//.test(parsed.pathname)) {
    return homepageOf(url)
  }
  parsed.protocol = 'https:'
  parsed.search = ''
  parsed.hash = ''
  return parsed.href
}

module.exports = {
  isWebUrl,
  hostOf,
  domainOf,
  urlKey,
  homepageOf,
  siteUrl
}
