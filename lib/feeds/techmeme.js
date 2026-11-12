const cheerio = require('cheerio')

// Leaderboard OPML: who gets cited, so no topic tags.
const parse = function (xml) {
  const $ = cheerio.load(xml, { xml: true })

  return $('outline').toArray().flatMap(function (outline) {
    const title = ($(outline).attr('text') || $(outline).attr('title') || '').trim()
    const url = $(outline).attr('htmlUrl') || $(outline).attr('url')
    return title && url ? [{ title, url }] : []
  })
}

const leaderboard = function (id, url) {
  return { id, trusted: false, format: 'xml', pages: [{ url }], parse }
}

module.exports = [
  leaderboard('techmeme', 'https://www.techmeme.com/lb.opml'),
  leaderboard('memeorandum', 'https://www.memeorandum.com/lb.opml'),
  leaderboard('mediagazer', 'https://mediagazer.com/lb.opml')
]
