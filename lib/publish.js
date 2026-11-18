const _ = require('lodash')
const { TIERS } = require('./editor')

const SIMILAR = 6

const iconUrl = url => `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`

// Sources sharing a topic, by shared topics, then regions, then tier distance.
const similarIds = function (source, sources, tags) {
  const ofKind = kind => new Set(tags.filter(tag => tag.kind === kind).map(tag => tag.id))
  const topics = ofKind('topic')
  const regions = ofKind('region')
  const shared = (other, within) => other.tags.filter(tag => within.has(tag) && source.tags.includes(tag)).length
  const rank = tier => TIERS.indexOf(tier)

  return _.chain(sources)
    .filter(other => other.id !== source.id && shared(other, topics) > 0)
    .map(other => ({
      other,
      score: shared(other, topics) * 3 + shared(other, regions) * 2 - Math.abs(rank(other.tier) - rank(source.tier))
    }))
    .orderBy(['score', match => rank(match.other.tier), 'other.title'], ['desc', 'asc', 'asc'])
    .take(SIMILAR)
    .map(match => match.other.id)
    .value()
}

// The published files: sources with icon and similar, used tags and tiers with their order.
const publishData = function (sources, tags, tiers) {
  const used = new Set(sources.flatMap(source => source.tags))
  return {
    sources: sources.map(source => _.assign({}, source, {
      icon: iconUrl(source.url),
      similar: similarIds(source, sources, tags)
    })),
    tags: tags
      .filter(tag => used.has(tag.id))
      .map((tag, order) => _.assign({ id: tag.id, order }, _.omit(tag, 'id'))),
    tiers: tiers.map((tier, order) => _.assign({ id: tier.id, order }, _.omit(tier, 'id')))
  }
}

module.exports = { publishData, similarIds, iconUrl }
