const _ = require('lodash')
const csv = require('csv-parse/sync')

// https://github.com/palewire/news-homepages
// RULES pick sites to import; the rest are enrichOnly.
const SOURCES = 'https://raw.githubusercontent.com/palewire/news-homepages/main/newshomepages/sources'

const RULES = [
  { bundle: 'us-national', tags: ['news', 'american'] },
  { country: 'IE', tags: ['irish'] },
  { bundle: 'tech', tags: ['tech'] },
  { bundle: 'entertainment', tags: ['culture'] },
  { bundle: 'sports', tags: ['sports'] },
  { bundle: 'science', tags: ['science'] }
]

const REGIONS = {
  US: 'american',
  GB: 'british',
  IE: 'irish',
  CA: 'canadian',
  AU: 'australian',
  NZ: 'new-zealand'
}

const matches = function (rule, row) {
  return (!rule.bundle || row.bundles.includes(rule.bundle)) &&
    (!rule.country || row.country === rule.country)
}

const parse = function (body, rules = RULES) {
  return csv.parse(body, { columns: true, skip_empty_lines: true, trim: true }).map(function (row) {
    const country = row.country.toUpperCase()
    const bundles = row.bundle ? row.bundle.split('|') : []
    const picked = rules.filter(rule => matches(rule, { country, bundles }))

    return {
      title: row.name,
      url: row.url,
      tags: _.compact(_.union([REGIONS[country]], ...picked.map(rule => rule.tags))),
      enrichOnly: picked.length === 0
    }
  })
}

module.exports = {
  id: 'palewire',
  trusted: true,
  format: 'csv',
  pages: [{ url: `${SOURCES}/sites.csv` }],
  parse,
  rules: RULES,
  bundlesUrl: `${SOURCES}/bundles.csv`
}
