const EDITIONS = {
  gb: 'british',
  us: 'american'
}

const parse = function (records) {
  return records.map(function (record) {
    return {
      title: record.name,
      url: record.url,
      tags: EDITIONS[record.geo] ? [EDITIONS[record.geo]] : []
    }
  })
}

module.exports = {
  id: 'newzit',
  trusted: true,
  format: 'json',
  pages: [{ url: 'https://www.newzit.com/api/domainThumbs' }],
  parse
}
