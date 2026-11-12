const fs = require('fs')
const path = require('path')
const slugify = require('slugify')
const { parse } = require('tldts')
const { hostOf, urlKey, domainOf } = require('./url')

const DATA_FOLDER = path.join(__dirname, '../data')

const dataPath = function (name) {
  return path.join(DATA_FOLDER, name)
}

const readJson = function (name) {
  return JSON.parse(fs.readFileSync(dataPath(name), 'utf8'))
}

const writeJson = function (name, data) {
  fs.writeFileSync(dataPath(name), JSON.stringify(data, null, 2) + '\n')
}

// Stable once stored: www.nytimes.com -> nytimes, news.ycombinator.com -> news-ycombinator.
const makeId = function (url, taken) {
  const { subdomain, domainWithoutSuffix } = parse(url)
  const name = [subdomain?.replace(/^www\d*\.?/, ''), domainWithoutSuffix].filter(Boolean).join(' ')
  const base = slugify(name || hostOf(url), { lower: true, strict: true }) || 'site'
  let id = base
  for (let n = 2; taken.has(id); n++) {
    id = `${base}-${n}`
  }
  taken.add(id)
  return id
}

// ignore-urls.txt: one rule per line.
//   mailto:                     drops a scheme
//   https://facebook.com/       drops that host and its subdomains
//   https://bbc.co.uk/sport     drops that path and everything under it
const parseIgnore = function (text) {
  const rules = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))

  const schemes = rules.filter(rule => /^[a-z][a-z0-9+.-]*:$/i.test(rule))
  const urlRules = rules.filter(rule => !schemes.includes(rule)).map(urlKey)
  const hosts = urlRules.filter(rule => !rule.includes('/'))
  const paths = urlRules.filter(rule => rule.includes('/'))

  return function (url) {
    if (schemes.some(scheme => url.toLowerCase().startsWith(scheme))) {
      return true
    }
    const host = hostOf(url)
    const key = urlKey(url)
    return hosts.some(ignored => host === ignored || host.endsWith(`.${ignored}`)) ||
      paths.some(ignored => key === ignored || key.startsWith(`${ignored}/`))
  }
}

// Match by URL, then host (homepage links), then the only site on the
// domain unless this feed already listed it.
const SiteIndex = function () {
  this.byKey = new Map()
  this.byHost = new Map()
  this.byDomain = new Map()
}

SiteIndex.prototype.add = function (site) {
  const key = urlKey(site.url)
  const host = key.split('/')[0]
  const domain = domainOf(site.url)
  this.byKey.set(key, site)
  if (!this.byHost.has(host)) {
    this.byHost.set(host, site)
  }
  this.byDomain.set(domain, [...(this.byDomain.get(domain) || []), site])
}

SiteIndex.prototype.find = function (url, feedId) {
  const key = urlKey(url)
  const isHomepage = !key.includes('/')
  const onDomain = this.byDomain.get(domainOf(url)) || []
  const domainMatch = onDomain.length === 1 && !onDomain[0].feeds?.includes(feedId)
  return this.byKey.get(key) ||
    (isHomepage ? this.byHost.get(key) : undefined) ||
    (domainMatch ? onDomain[0] : undefined)
}

SiteIndex.prototype.values = function () {
  return [...this.byKey.values()]
}

const loadIgnore = function () {
  return parseIgnore(fs.readFileSync(dataPath('ignore-urls.txt'), 'utf8'))
}

// Exact URLs only, no subdomains. Delete a line to have a site judged again.
const REJECTED = 'rejected-urls.txt'

const parseRejected = function (text) {
  const keys = new Set(text
    .split('\n')
    .map(line => line.split('#')[0].trim())
    .filter(Boolean)
    .map(urlKey))
  return url => keys.has(urlKey(url))
}

const loadRejected = function () {
  const file = dataPath(REJECTED)
  return parseRejected(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')
}

const addRejected = function (rejections) {
  if (!rejections.length) return
  const lines = rejections.map(({ url, reason }) => `${url}  # ${reason.replace(/\s+/g, ' ')}`)
  fs.appendFileSync(dataPath(REJECTED), lines.join('\n') + '\n')
}

module.exports = {
  readJson,
  writeJson,
  makeId,
  parseIgnore,
  loadIgnore,
  parseRejected,
  loadRejected,
  addRejected,
  SiteIndex
}
