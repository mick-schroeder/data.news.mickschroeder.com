const _ = require('lodash')
const { fetchBody } = require('./http')

// Feed: { id, trusted, format, pages: [{ url, tags? }], tags?, parse }
// parse(body) -> [{ title, url, tags?, enrichOnly? }]
// enrichOnly links never add sites, so those feeds go last.
const feeds = [
  require('./newzit'),
  require('./brutalist'),
  ...require('./techmeme'),
  require('./drudge'),
  require('./palewire')
]

const runFeed = async function (feed, fetchPage = fetchBody) {
  const links = []
  for (const page of feed.pages) {
    const body = await fetchPage(page.url, feed.format)
    for (const link of feed.parse(body)) {
      links.push(_.assign({}, link, {
        tags: _.union(feed.tags, page.tags, link.tags)
      }))
    }
  }
  return links
}

module.exports = feeds
module.exports.runFeed = runFeed
