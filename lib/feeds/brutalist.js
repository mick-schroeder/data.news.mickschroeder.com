const _ = require('lodash')
const cheerio = require('cheerio')
const { isWebUrl, homepageOf } = require('../url')

const TOPICS = ['news', 'tech', 'business', 'science', 'gaming', 'culture', 'politics', 'sports']

// Skip blocks without a dominant host (aggregators, redirects).
const MIN_SHARE = 0.6

const parse = function (html) {
  const $ = cheerio.load(html)

  return $('h3 a[href^="/source/"]').toArray().flatMap(function (heading) {
    const homepages = $(heading).closest('h3').next('ul').find('li > a')
      .toArray()
      .map(link => $(link).attr('href'))
      .filter(isWebUrl)
      .map(homepageOf)

    const counts = _.countBy(homepages)
    const top = _.maxBy(Object.keys(counts), homepage => counts[homepage])

    if (!top || counts[top] < MIN_SHARE * homepages.length) {
      return []
    }

    return [{ title: $(heading).text().trim(), url: top }]
  })
}

module.exports = {
  id: 'brutalist',
  trusted: true,
  format: 'html',
  pages: TOPICS.map(topic => ({ url: `https://brutalist.report/topic/${topic}`, tags: [topic] })),
  parse
}
