const _ = require('lodash')
const { z } = require('zod')
const fs = require('fs')
const path = require('path')

const BATCH_SIZE = 50

// Best first, from data/tiers.json.
const TIERS = require('../data/tiers.json').map(tier => tier.id)

const HAND_APPLIED = ['sponsor']

// Feed tags are derived, not chosen.
const choosableTags = function (tags) {
  return tags.filter(tag => tag.kind !== 'feed' && !HAND_APPLIED.includes(tag.id))
}

const answerSchema = function (tagIds) {
  return z.object({
    sites: z.array(z.object({
      url: z.string(),
      verdict: z.enum(['include', 'reject']),
      title: z.string(),
      description: z.string(),
      tier: z.enum(TIERS),
      tags: z.array(z.enum(tagIds)),
      duplicateOf: z.string().nullable()
    }))
  })
}

const systemPrompt = function (tags) {
  const policy = fs.readFileSync(path.join(__dirname, '../data/prompt.md'), 'utf8')
  return [
    policy.trim(),
    '## Tags you may use',
    choosableTags(tags).map(tag => `- ${tag.id}: ${tag.description}`).join('\n')
  ].join('\n\n')
}

const userMessage = function (sites, batch) {
  return [
    '## Every site in tonight\'s list (for spotting duplicates)',
    sites.map(site => `- ${site.url} ${site.title}`).join('\n'),
    '## Sites to judge',
    JSON.stringify(batch)
  ].join('\n\n')
}

const candidate = function (site) {
  return _.omitBy({
    url: site.url,
    title: site.title,
    listedBy: site.feeds,
    fromTrustedDirectory: site.trusted,
    seeded: site.seeded || undefined,
    tags: site.feedTags
  }, _.isNil)
}

const checkAnswer = function (answer, asked, urls) {
  if (!asked.has(answer.url)) {
    return null
  }
  return _.assign({}, answer, {
    duplicateOf: urls.has(answer.duplicateOf) && answer.duplicateOf !== answer.url ? answer.duplicateOf : null
  })
}

// candidates: the sites to judge (new, or kept without a tier); the rest are context for spotting duplicates.
const evaluate = async function (sites, tags, prompt, candidates = sites.filter(site => !site.known || !site.tier)) {
  const problems = []
  if (!candidates.length) {
    return { verdicts: new Map(), problems }
  }

  const system = systemPrompt(tags)
  const schema = answerSchema(choosableTags(tags).map(tag => tag.id))
  const urls = new Set(sites.map(site => site.url))
  const verdicts = new Map()

  for (const batch of _.chunk(candidates, BATCH_SIZE)) {
    const asked = new Set(batch.map(site => site.url))
    try {
      const answer = await prompt(system, userMessage(sites, batch.map(candidate)), schema)
      if (!answer) problems.push(`editor: batch of ${batch.length} got no answer`)
      for (const each of answer?.sites || []) {
        const checked = checkAnswer(each, asked, urls)
        if (checked) verdicts.set(checked.url, checked)
      }
    } catch (error) {
      problems.push(`editor: batch failed: ${error.message}`)
    }
  }

  console.log({ editor: { asked: candidates.length, answered: verdicts.size } })
  return { verdicts, problems }
}

// Keep the stored site, else the one more feeds list.
const duplicateLoser = function (site, original) {
  if (original.known) return site
  return site.feeds.length > original.feeds.length ? original : site
}

// Kept sites are never rejected; they only get missing fields filled in.
const applyVerdicts = function (sites, verdicts) {
  const byUrl = new Map(sites.map(site => [site.url, site]))
  const reasons = new Map()

  for (const [url, verdict] of verdicts) {
    if (verdict.verdict === 'reject' && !byUrl.get(url)?.known) reasons.set(url, verdict.reason)
  }

  for (const [url, verdict] of verdicts) {
    const site = byUrl.get(url)
    const original = byUrl.get(verdict.duplicateOf)
    if (!site || site.known || !original || reasons.has(url) || reasons.has(original.url)) continue
    if (!original.known && verdicts.get(original.url)?.verdict !== 'include') continue

    const loser = duplicateLoser(site, original)
    const winner = loser === site ? original : site
    reasons.set(loser.url, `duplicate of ${winner.url}`)
  }

  const rejections = []
  for (const site of sites) {
    const verdict = verdicts.get(site.url)
    if (!verdict) continue

    if (reasons.has(site.url)) {
      site.accepted = false
      rejections.push({ url: site.url, reason: reasons.get(site.url) })
      continue
    }

    if (site.known) {
      _.defaults(site, { tier: verdict.tier, description: verdict.description })
      if (_.isEmpty(site.tags)) site.tags = verdict.tags
      continue
    }

    _.assign(site, {
      accepted: true,
      title: verdict.title,
      description: verdict.description,
      tier: verdict.tier,
      tags: verdict.tags
    })
  }
  return rejections
}

const tagChange = function (before, after) {
  const added = _.difference(after, before)
  const removed = _.difference(before, after)
  return added.length || removed.length ? { added, removed } : null
}

// Refresh: new tier, description and tags; id, title and url stay.
// before: data/sources.json. sites: stored sites from gatherSites.
const applyRefresh = function (before, sites, verdicts) {
  const byId = new Map(sites.map(site => [site.id, site]))
  const report = { tiers: [], tags: [], wouldReject: [], unanswered: [] }

  const next = before.map(function (site) {
    const verdict = verdicts.get(byId.get(site.id)?.url)
    // Seeded sites are never rejected; keep them as they are.
    if (!verdict || (verdict.verdict === 'reject' && byId.get(site.id).seeded)) {
      report.unanswered.push(site.id)
      return site
    }
    if (verdict.verdict === 'reject') {
      report.wouldReject.push({ id: site.id, reason: verdict.reason })
      return site
    }
    if (verdict.tier !== site.tier) report.tiers.push({ id: site.id, from: site.tier, to: verdict.tier })
    // Hand-applied tags like sponsor aren't the editor's to drop.
    const tags = _.union(_.intersection(site.tags, HAND_APPLIED), verdict.tags)
    const change = tagChange(site.tags || [], tags)
    if (change) report.tags.push(_.assign({ id: site.id }, change))
    return _.assign({}, site, { tier: verdict.tier, description: verdict.description, tags })
  })
  return { next, report }
}

module.exports = { evaluate, applyVerdicts, applyRefresh, choosableTags, TIERS }
