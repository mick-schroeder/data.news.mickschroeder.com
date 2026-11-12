const cheerio = require('cheerio')
const { isWebUrl, hostOf, homepageOf } = require('../url')

// Every outbound link counts; outlet-list names ("NY TIMES") win over hosts.
const DRUDGE_HOSTS = /(^|\.)drudgereport(archives)?\.com$/

const looksLikeOutletName = function (text, url) {
  return text.length > 0 && text.length <= 40 &&
    text === text.toUpperCase() && /[A-Z]/.test(text) &&
    !/[!?:]|\.\.\./.test(text) &&
    !/\/(19|20)\d\d\//.test(new URL(url).pathname)
}

const parse = function (html) {
  const $ = cheerio.load(html)
  const sites = new Map()

  for (const link of $('a[href]').toArray()) {
    const url = $(link).attr('href')
    if (!isWebUrl(url) || DRUDGE_HOSTS.test(hostOf(url))) {
      continue
    }

    const host = hostOf(url)
    const text = $(link).text().replace(/\s+/g, ' ').trim()
    const named = looksLikeOutletName(text, url)
    const site = sites.get(host)

    if (!site || (named && !site.named)) {
      sites.set(host, {
        title: named ? text.replace(/\[[^\]]*\]/g, '').trim() : host,
        url: homepageOf(url),
        tags: named && /\[UK\]/i.test(text) ? ['british'] : [],
        named
      })
    }
  }

  return [...sites.values()].map(({ named, ...site }) => site)
}

module.exports = {
  id: 'drudge',
  trusted: false,
  format: 'html',
  pages: [{ url: 'https://www.drudgereport.com/' }],
  parse
}
