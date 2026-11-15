const _ = require('lodash')
const { z } = require('zod')
const feeds = require('./lib/feeds')
const { runFeed } = feeds
const config = require('./config')
const anthropic = require('./lib/anthropic')
const editor = require('./lib/editor')
const { readJson, writeJson, makeId, loadIgnore, loadRejected, addRejected, SiteIndex } = require('./lib/sites')
const { isWebUrl, urlKey, siteUrl } = require('./lib/url')

const FIELDS = ['id', 'title', 'url', 'description', 'tier', 'tags']
// Stored in data/, never published.
const STORED = [...FIELDS, 'flaggedForRetiringAt', 'retiredAt']
const DAY = 24 * 60 * 60 * 1000

const siteFields = function (site, tags, fields = FIELDS) {
  return _.omitBy(_.pick(_.assign({}, site, { tags }), fields), _.isNil)
}

// Feed tags are only hints for the editor; they're never published.
const sanatizeForResponse = function (site) {
  return siteFields(site, _.union(site.tags, site.derivedTags))
}

// Same rules as news.mickschroeder.com's siteSchema.
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const publishedSchema = function (tags) {
  return z.object({
    id: slug,
    title: z.string().trim().min(1),
    url: z.url({ protocol: /^https$/ }),
    description: z.string().optional(),
    tier: z.enum(editor.TIERS).optional(),
    tags: z.array(z.enum(tags.map(tag => tag.id))).min(1)
  })
}

// Drops sites that would fail the site's build.
const checkPublished = function (sites, tags) {
  const schema = publishedSchema(tags)
  const [valid, invalid] = _.partition(sites, site => schema.safeParse(site).success)
  return { valid, problems: invalid.map(site => `published: dropped invalid site ${site.id || site.url}`) }
}

// Aggregator tags from feeds, and tier tags like popular.
const derivedTags = function (site, tags) {
  return tags
    .filter(tag => (tag.feed && site.feeds.includes(tag.feed)) || tag.tiers?.includes(site.tier))
    .map(tag => tag.id)
}

const newSite = function (site, fields) {
  return _.assign(_.pick(site, STORED), {
    feeds: [],
    feedTags: []
  }, fields)
}

// seed.json overrides stored and retired sites, matched by id then URL.
const applySeed = function (stored, seed) {
  const sites = stored.map(site => _.clone(site))

  for (const entry of seed) {
    const fields = _.assign(_.pick(entry, FIELDS), { seeded: true })
    const match = sites.find(site => site.id === entry.id) ||
      sites.find(site => urlKey(site.url) === urlKey(entry.url))

    if (match) {
      _.assign(match, fields)
    } else {
      sites.push(fields)
    }
  }
  return sites
}

// Only the editor accepts new sites; trusted feeds are a hint.
const listSite = function (site, feed, link) {
  const picks = feed.trusted && !link.enrichOnly
  // Prefer the first trusted feed's title.
  if (!site.known && picks && !site.trusted) {
    site.title = link.title
  }
  site.feeds = _.union(site.feeds, [feed.id])
  site.feedTags = _.union(site.feedTags, link.tags)
  site.trusted = site.trusted || picks
}

// Unlisted sites are flagged, then retired after RETIRE_AFTER_DAYS,
// at most RETIRE_PER_RUN a run, oldest flag first; the rest are held.
// Listed or seeded sites are cleared and restored.
const updateRetirement = function (sites, { now, feedFailed, days = config.RETIRE_AFTER_DAYS, perRun = config.RETIRE_PER_RUN }) {
  const changes = { flagged: [], cleared: [], retired: [], restored: [], held: [] }
  const stamp = now.toISOString()
  const due = []

  for (const site of sites.filter(site => site.known)) {
    if (site.feeds.length || site.seeded) {
      if (site.retired) {
        changes.restored.push(site.id)
      } else if (site.flaggedForRetiringAt) {
        changes.cleared.push(site.id)
      }
      _.assign(site, { retired: false, flaggedForRetiringAt: undefined, retiredAt: undefined })
    } else if (site.retired) {
      continue
    } else if (!site.flaggedForRetiringAt) {
      if (feedFailed) continue
      site.flaggedForRetiringAt = stamp
      changes.flagged.push(site.id)
    } else if (now - new Date(site.flaggedForRetiringAt) >= Number(days) * DAY) {
      due.push(site)
    }
  }

  const oldest = _.sortBy(due, 'flaggedForRetiringAt')
  const held = oldest.slice(Number(perRun))
  for (const site of oldest.slice(0, Number(perRun))) {
    _.assign(site, { retired: true, retiredAt: stamp })
    changes.retired.push(site.id)
  }
  changes.held = held.map(site => site.id)
  return changes
}

const gatherSites = async function (problems) {
  const isIgnored = loadIgnore()
  const isRejected = loadRejected()
  const sites = new SiteIndex()

  const stored = [
    ...readJson('sources.json'),
    ...readJson('retired.json').map(site => _.assign({}, site, { retired: true }))
  ]
  for (const site of applySeed(stored, readJson('seed.json'))) {
    sites.add(newSite(site, {
      known: true,
      accepted: true,
      retired: Boolean(site.retired),
      seeded: Boolean(site.seeded)
    }))
  }

  for (const feed of feeds) {
    let links = []
    try {
      links = await runFeed(feed)
      if (links.length < config.MIN_FEED_LINKS) problems.push(`${feed.id}: ${links.length} sites, expected ${config.MIN_FEED_LINKS}+`)
    } catch (error) {
      problems.push(`${feed.id}: ${error.message}`)
    }
    console.log({ feed: feed.id, count: links.length })

    for (const link of links) {
      if (!isWebUrl(link.url)) {
        continue
      }

      const url = siteUrl(link.url)
      if (isIgnored(url) || isRejected(url)) {
        continue
      }

      if (!sites.find(url, feed.id)) {
        if (link.enrichOnly) {
          continue
        }
        sites.add(newSite(link, { url, tags: [], known: false, accepted: false }))
      }

      listSite(sites.find(url, feed.id), feed, link)
    }
  }

  return sites.values()
}

// Only kept sites get ids, so a rejected site can't take one.
const finishSites = function (sites, tags) {
  const taken = new Set(sites.map(site => site.id).filter(Boolean))

  return sites.map(function (site) {
    return _.assign(site, {
      id: site.id || (site.accepted ? makeId(site.url, taken, tags.map(tag => tag.id)) : undefined),
      derivedTags: derivedTags(site, tags)
    })
  })
}

module.exports = (function () {
  let allSites = null
  let rejections = []
  let retirement = null
  const problems = []

  const getSites = async function () {
    if (!allSites) {
      const tags = readJson('tags.json')
      const sites = await gatherSites(problems)
      retirement = updateRetirement(sites, { now: new Date(), feedFailed: problems.length > 0 })
      if (retirement.held.length) {
        problems.push(`retirement: ${retirement.held.length} sites held, over ${config.RETIRE_PER_RUN} a run`)
      }
      if (config.ANTHROPIC_API_KEY) {
        // Retired sites can't be duplicates of new ones.
        const listed = sites.filter(site => !site.retired)
        const result = await editor.evaluate(listed, tags, anthropic.prompt)
        rejections = editor.applyVerdicts(listed, result.verdicts)
        problems.push(...result.problems)
      }
      allSites = finishSites(sites, tags)
    }
    return allSites
  }

  const ListBuilder = function () {}

  // Feeds or AI batches that failed tonight.
  ListBuilder.prototype.problems = async function () {
    await getSites()
    return problems
  }

  // Sites flagged, cleared, retired and restored tonight.
  ListBuilder.prototype.retirement = async function () {
    await getSites()
    return retirement
  }

  ListBuilder.prototype.filter = async function () {
    const sites = (await getSites())
      .filter(site => site.accepted && !site.retired)
      .map(sanatizeForResponse)
    const { valid, problems: invalid } = checkPublished(sites, readJson('tags.json'))
    problems.push(...invalid)
    return valid
  }

  ListBuilder.prototype.all = async function () {
    return (await getSites()).filter(site => !site.retired).map(function (site) {
      return _.assign(sanatizeForResponse(site), _.pick(site, ['feeds', 'accepted']))
    })
  }

  // New sites are judged once; rejections go to rejected-urls.txt.
  ListBuilder.prototype.saveSources = async function () {
    const sites = await getSites()
    const stored = sites
      .filter(site => site.known && !site.retired)
      .map(site => siteFields(site, site.tags, STORED))
    const added = _.chain(sites)
      .filter(site => site.accepted && !site.known)
      .map(site => siteFields(site, site.tags, STORED))
      .sortBy('id')
      .value()
    const retired = _.chain(sites)
      .filter('retired')
      .map(site => siteFields(site, site.tags, STORED))
      .sortBy('id')
      .value()

    const next = [...stored, ...added]
    if (!_.isEqual(next, readJson('sources.json'))) {
      writeJson('sources.json', next)
    }
    if (!_.isEqual(retired, readJson('retired.json'))) {
      writeJson('retired.json', retired)
    }
    addRejected(rejections)
    return added
  }

  return ListBuilder
})()

module.exports.updateRetirement = updateRetirement
module.exports.applySeed = applySeed
module.exports.listSite = listSite
module.exports.finishSites = finishSites
module.exports.derivedTags = derivedTags
module.exports.checkPublished = checkPublished
module.exports.gatherSites = gatherSites
