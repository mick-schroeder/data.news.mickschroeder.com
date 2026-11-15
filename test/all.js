const expect = require('./expect')
const _ = require('lodash')
const csv = require('csv-parse/sync')
const feeds = require('../lib/feeds')
const { fetchBody } = require('../lib/feeds/http')
const { readJson, makeId, parseIgnore, parseRejected, SiteIndex } = require('../lib/sites')
const editor = require('../lib/editor')
const { updateRetirement, applySeed, listSite, finishSites, derivedTags, checkPublished } = require('../index')
const { isWebUrl, urlKey, domainOf, homepageOf, siteUrl } = require('../lib/url')

const tags = readJson('tags.json')
const tagIds = tags.map(tag => tag.id)
const feed = id => feeds.find(feed => feed.id === id)

const expectSite = function (site) {
  expect(site.title).to.be.string()
  expect(isWebUrl(site.url)).to.be.true()
  if (site.tier !== undefined) expect(editor.TIERS).to.include(site.tier)
  for (const tag of site.tags || []) expect(tagIds).to.include(tag)
}

describe('urls', function () {
  it('should only accept http(s) links', function () {
    expect(isWebUrl('http://arstechnica.com')).to.be.true()
    for (const url of ['javascript:alert(1)', 'vbscript:x', 'file:///etc/passwd', 'ftp://example.com/', 'not a url']) {
      expect(isWebUrl(url)).to.be.false()
    }
  })

  it('should treat www and trailing slashes as the same site', function () {
    expect(urlKey('https://www.bbc.co.uk/news/')).to.equal(urlKey('https://bbc.co.uk/news'))
    expect(urlKey('https://bbc.co.uk/news')).not.to.equal(urlKey('https://bbc.co.uk/sport'))
    expect(urlKey('https://www.dailymail.com/ushome/index.html')).to.equal(urlKey('https://dailymail.com/ushome/'))
    expect(urlKey('https://www.dailymail.com/ushome/index.html')).not.to.equal(urlKey('https://dailymail.com/home/index.html'))
  })

  it('should clean feed links into site URLs', function () {
    expect(siteUrl('http://arstechnica.com')).to.equal('https://arstechnica.com/')
    expect(siteUrl('https://www.bbc.co.uk/news/?ref=x#top')).to.equal('https://www.bbc.co.uk/news/')
    expect(siteUrl('https://current.org/2026/11/some-story/')).to.equal('https://current.org/')
    expect(siteUrl('https://www.dailymail.com/ushome/index.html')).to.equal('https://www.dailymail.com/ushome/index.html')
    expect(homepageOf('http://www.bbc.co.uk/news/world-123')).to.equal('https://www.bbc.co.uk/')
  })

  it('should find the registrable domain', function () {
    expect(domainOf('https://online.wsj.com/home-page')).to.equal('wsj.com')
    expect(domainOf('http://news.bbc.co.uk/default.stm')).to.equal('bbc.co.uk')
  })
})

describe('sites', function () {
  it('should make readable, unique ids', function () {
    const taken = new Set()
    expect(makeId('https://www.nytimes.com/', taken)).to.equal('nytimes')
    expect(makeId('https://nytimes.com/', taken)).to.equal('nytimes-2')
    expect(makeId('https://news.ycombinator.com/', taken)).to.equal('news-ycombinator')
    expect(makeId('https://www.bbc.co.uk/news', taken)).to.equal('bbc')
    expect(makeId('https://www1.folha.uol.com.br/', taken)).to.equal('folha-uol')
    expect(makeId('https://english.elpais.com/', taken)).to.equal('elpais')
    expect(makeId('https://en.wikipedia.org/wiki/Portal:Current_events', taken)).to.equal('wikipedia')
    expect(makeId('https://politics.co.uk/', taken, ['politics'])).to.equal('politics-co-uk')
  })

  it('should match links by URL, then host, then a domain with one site', function () {
    const sites = new SiteIndex()
    for (const [id, url] of [
      ['bbc', 'https://www.bbc.co.uk/news'],
      ['wsj', 'https://www.wsj.com/'],
      ['mail-gb', 'https://www.dailymail.com/home/index.html'],
      ['mail-us', 'https://www.dailymail.com/ushome/index.html']
    ]) {
      sites.add({ id, url })
    }
    const found = url => sites.find(url)?.id

    expect(found('https://bbc.co.uk/news/')).to.equal('bbc')
    expect(found('https://www.bbc.co.uk/')).to.equal('bbc')
    expect(found('https://news.bbc.co.uk/default.stm')).to.equal('bbc')
    expect(found('https://online.wsj.com/home-page')).to.equal('wsj')
    expect(found('https://www.dailymail.com/')).to.equal('mail-gb')
    expect(found('https://www.dailymail.com/news/index.html')).to.be.undefined()
    expect(found('https://example.com/')).to.be.undefined()
  })

  it('should not match a feed\'s link to a site the same feed listed', function () {
    const sites = new SiteIndex()
    sites.add({ id: 'yahoo-gb', url: 'https://uk.news.yahoo.com/', feeds: ['newzit'] })

    expect(sites.find('https://www.yahoo.com/', 'newzit')).to.be.undefined()
    expect(sites.find('https://www.yahoo.com/', 'drudge')?.id).to.equal('yahoo-gb')
  })

  it('should ignore schemes, hosts with subdomains, and path prefixes', function () {
    const isIgnored = parseIgnore('# comment\nmailto:\nhttps://facebook.com/\nhttps://bbc.co.uk/sport\n')
    expect(isIgnored('mailto:someone@example.com')).to.be.true()
    expect(isIgnored('https://m.facebook.com/page')).to.be.true()
    expect(isIgnored('https://www.bbc.co.uk/sport/football')).to.be.true()
    expect(isIgnored('https://www.bbc.co.uk/sports')).to.be.false()
    expect(isIgnored('https://www.bbc.co.uk/news')).to.be.false()
  })

  it('should match rejected sites exactly, without subdomains', function () {
    const isRejected = parseRejected('https://www.yahoo.com/  # a portal\n')
    expect(isRejected('https://yahoo.com')).to.be.true()
    expect(isRejected('https://sports.yahoo.com/')).to.be.false()
  })
})

describe('editor', function () {
  const known = { url: 'https://abcnews.go.com', title: 'ABC News', tier: 'A', known: true, feeds: [], feedTags: [] }
  const newSite = (url, title, fields) => _.assign({ url, title, known: false, feeds: ['drudge'], feedTags: [] }, fields)

  it('should only use tags the editor may choose', function () {
    const ids = editor.choosableTags(tags).map(tag => tag.id)
    expect(ids).to.include('news')
    expect(ids).not.to.include('sponsor')
    expect(ids).not.to.include('newzit')
    expect(ids).to.include('british')
    expect(ids).not.to.include('popular')
  })

  it('should ask only about new sites, and keep only sensible answers', async function () {
    const sites = [known, newSite('https://www.bloomberg.com/', 'Bloomberg'), newSite('https://trends.google.com/', 'trends.google.com')]
    let asked
    const prompt = async (system, content) => {
      asked = JSON.parse(content).map(site => site.url)
      return {
        sites: [
          { url: 'https://www.bloomberg.com/', verdict: 'include', title: 'Bloomberg', description: 'Business news.', tags: ['business'], duplicateOf: null, reason: 'news' },
          { url: 'https://trends.google.com/', verdict: 'reject', title: 'Google Trends', description: '', tags: [], duplicateOf: 'https://not-in-the-list.com/', reason: 'not a news site' },
          { url: 'https://never-asked.com/', verdict: 'include', title: 'X', description: '', tags: [], duplicateOf: null, reason: '' }
        ]
      }
    }

    const { verdicts, problems } = await editor.evaluate(sites, tags, prompt)
    expect(problems).to.eql([])
    expect(asked).to.eql(['https://www.bloomberg.com/', 'https://trends.google.com/'])
    expect([...verdicts.keys()]).to.eql(['https://www.bloomberg.com/', 'https://trends.google.com/'])
    expect(verdicts.get('https://trends.google.com/').duplicateOf).to.be.null()
  })

  it('should ask about the sites it is given, known ones too', async function () {
    let asked
    const prompt = async (system, content) => { asked = JSON.parse(content).map(site => site.url); return null }
    await editor.evaluate([known, newSite('https://www.bloomberg.com/', 'Bloomberg')], tags, prompt, [known])
    expect(asked).to.eql([known.url])
  })

  it('should tell the AI which sites are hand-picked', async function () {
    let asked
    const prompt = async (system, content) => { asked = JSON.parse(content); return null }
    const seeded = _.assign({}, known, { seeded: true })
    await editor.evaluate([seeded, newSite('https://www.bloomberg.com/', 'Bloomberg')], tags, prompt, [seeded, newSite('https://www.bloomberg.com/', 'Bloomberg')])
    expect(asked.map(site => site.handPicked)).to.eql([true, undefined])
  })

  it('should refresh stored sites, keeping ids and titles', function () {
    const stored = { id: 'abc', title: 'ABC News', url: 'https://abc.com/', tier: 'B', tags: ['news'] }
    const fresh = { id: 'hn', title: 'Hacker News', url: 'https://news.ycombinator.com/', seeded: true }
    const picked = { id: 'me', title: 'Me', url: 'https://me.com/', tags: ['sponsor'], seeded: true }
    const answer = (url, fields) => [url, _.assign({ url, verdict: 'include', title: 'X', description: 'D', tier: 'A', tags: ['tech'], duplicateOf: null, reason: '' }, fields)]
    const { next, report } = editor.applyRefresh([stored, picked], [stored, fresh, picked], new Map([
      answer(stored.url),
      answer(fresh.url, { tier: 'C' }),
      answer(picked.url, { verdict: 'reject', reason: 'personal site' })
    ]))
    expect(next).to.eql([
      { id: 'abc', title: 'ABC News', url: 'https://abc.com/', tier: 'A', description: 'D', tags: ['tech'] },
      picked
    ])
    expect(report.unanswered).to.eql(['me'])
    expect(report.wouldReject).to.eql([])
  })

  it('should ask about kept sites without a tier', async function () {
    let asked
    const prompt = async (system, content) => { asked = JSON.parse(content).map(site => site.url); return null }
    const untiered = { url: 'https://news.ycombinator.com/', title: 'Hacker News', known: true, seeded: true, feeds: [], feedTags: [] }
    await editor.evaluate([known, untiered], tags, prompt)
    expect(asked).to.eql([untiered.url])
  })

  it('should only fill in a kept site, never reject it', function () {
    const seeded = () => ({ url: 'https://me.com/', title: 'Mick', tags: ['sponsor'], known: true, seeded: true, accepted: true, feeds: [], feedTags: [] })
    const verdict = fields => new Map([['https://me.com/', _.assign({ url: 'https://me.com/', verdict: 'include', title: 'Other', description: 'D', tier: 'C', tags: ['tech'], duplicateOf: null, reason: '' }, fields)]])

    const rejected = seeded()
    expect(editor.applyVerdicts([rejected], verdict({ verdict: 'reject', reason: 'personal site' }))).to.eql([])
    expect(rejected.accepted).to.be.true()

    const filled = seeded()
    editor.applyVerdicts([filled], verdict({}))
    expect(_.pick(filled, ['title', 'tier', 'description', 'tags'])).to.eql({ title: 'Mick', tier: 'C', description: 'D', tags: ['sponsor'] })
  })

  it('should report a failed AI call', async function () {
    const sites = [newSite('https://www.bloomberg.com/', 'Bloomberg')]
    const { verdicts, problems } = await editor.evaluate(sites, tags, async () => { throw new Error('down') })
    expect(verdicts.size).to.equal(0)
    expect(problems).to.eql(['editor: batch failed: down'])
  })

  it('should report a batch with no answer', async function () {
    const sites = [newSite('https://www.bloomberg.com/', 'Bloomberg')]
    const { problems } = await editor.evaluate(sites, tags, async () => null)
    expect(problems).to.eql(['editor: batch of 1 got no answer'])
  })

  it('should keep the duplicate more feeds list', function () {
    const wsj = newSite('https://www.wsj.com/', 'WSJ', { feeds: ['newzit', 'techmeme', 'drudge'] })
    const online = newSite('https://online.wsj.com/', 'WSJ', { feeds: ['drudge'] })
    const msnbc = newSite('https://www.msnbc.com/', 'MSNBC')
    const msNow = newSite('https://www.ms.now/', 'MS NOW')
    const verdict = (url, duplicateOf) => [url, { url, verdict: 'include', title: '', description: '', tags: [], duplicateOf, reason: '' }]

    const rejections = editor.applyVerdicts([wsj, online, msnbc, msNow], new Map([
      verdict(wsj.url, online.url),
      verdict(online.url, null),
      verdict(msnbc.url, msNow.url),
      verdict(msNow.url, msnbc.url)
    ]))
    expect(rejections.map(r => r.url)).to.eql([online.url, msnbc.url])
    expect(wsj.accepted).to.be.true()
    expect(msNow.accepted).to.be.true()
  })

  it('should apply includes, rejections and duplicates', function () {
    const bloomberg = newSite('https://www.bloomberg.com/', 'BLOOMBERG', { accepted: false })
    const trends = newSite('https://trends.google.com/', 'trends.google.com', { accepted: false })
    const abc = newSite('https://abcnews.com/', 'ABCNEWS', { accepted: true })
    const verdict = (url, fields) => [url, _.assign({ url, verdict: 'include', title: '', description: '', tags: [], duplicateOf: null, reason: '' }, fields)]

    const rejections = editor.applyVerdicts([known, bloomberg, trends, abc], new Map([
      verdict(bloomberg.url, { title: 'Bloomberg', description: 'Business news.', tier: 'A', tags: ['business', 'american'] }),
      verdict(trends.url, { verdict: 'reject', reason: 'not a news site' }),
      verdict(abc.url, { duplicateOf: known.url })
    ]))

    expect(_.pick(bloomberg, ['accepted', 'title', 'description', 'tier', 'tags'])).to.eql({
      accepted: true, title: 'Bloomberg', description: 'Business news.', tier: 'A', tags: ['business', 'american']
    })
    expect(trends.accepted).to.be.false()
    expect(abc.accepted).to.be.false()
    expect(rejections).to.eql([
      { url: trends.url, reason: 'not a news site' },
      { url: abc.url, reason: `duplicate of ${known.url}` }
    ])
  })
})

describe('data', function () {
  it('should have valid tags', function () {
    expect(_.uniq(tagIds).length).to.equal(tags.length)
    for (const tag of tags) {
      expect(tag.id).to.match(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(tag.title).to.be.string()
      expect(tag.kind).to.be.string()
      if (tag.feed !== undefined) expect(feeds.map(feed => feed.id)).to.include(tag.feed)
      if (tag.url !== undefined) expect(tag.url).to.match(/^https:\/\/[^\s]+$/)
    }
  })

  it('should not have a site both listed and retired', function () {
    const sources = readJson('sources.json')
    const retired = readJson('retired.json')
    expect(_.intersection(sources.map(site => site.id), retired.map(site => site.id))).to.eql([])
    expect(_.intersection(sources.map(site => urlKey(site.url)), retired.map(site => urlKey(site.url)))).to.eql([])
  })

  it('should give every listed site a topic tag', function () {
    const topics = tags.filter(tag => tag.kind === 'tag').map(tag => tag.id)
    const sponsors = tags.filter(tag => tag.kind === 'sponsor').map(tag => tag.id)
    const missing = readJson('sources.json')
      .filter(site => !_.intersection(site.tags, sponsors).length)
      .filter(site => !_.intersection(site.tags, topics).length)
    expect(missing.map(site => site.id)).to.eql([])
  })

  for (const name of ['sources.json', 'seed.json', 'retired.json']) {
    it(`should have valid sites in ${name}`, function () {
      const sites = readJson(name)
      expect(_.uniqBy(sites, 'id').length).to.equal(sites.length)
      expect(_.uniqBy(sites, site => urlKey(site.url)).length).to.equal(sites.length)
      for (const site of sites) {
        expect(site.id).to.match(/^[a-z0-9]+(-[a-z0-9]+)*$/)
        expectSite(site)
      }
    })
  }
})

describe('listing', function () {
  const newSite = () => ({ title: 'Old', known: false, accepted: false, feeds: [], feedTags: [] })

  it('should not accept a new site from a trusted feed without the editor', function () {
    const site = newSite()
    listSite(site, { id: 'newzit', trusted: true }, { title: 'Newzit Title', tags: ['news'] })
    expect(site.accepted).to.be.false()
    expect(site.trusted).to.be.true()
  })

  it('should not give a rejected site\'s id away', function () {
    const rejected = _.assign(newSite(), { url: 'https://foo.com/' })
    const accepted = _.assign(newSite(), { url: 'https://www.foo.com/news', accepted: true })
    finishSites([rejected, accepted], tags)
    expect(accepted.id).to.equal('foo')
    expect(rejected.id).to.be.undefined()
  })

  it('should derive aggregator and popular tags', function () {
    expect(derivedTags({ feeds: ['newzit'], tier: 'A' }, tags)).to.eql(['newzit', 'popular'])
    expect(derivedTags({ feeds: [], tier: 'B' }, tags)).to.eql([])
    expect(derivedTags({ feeds: [] }, tags)).to.eql([])
  })

  it('should keep the first trusted feed\'s title', function () {
    const site = newSite()
    listSite(site, { id: 'drudge', trusted: false }, { title: 'Drudge Title' })
    listSite(site, { id: 'newzit', trusted: true }, { title: 'Newzit Title' })
    listSite(site, { id: 'brutalist', trusted: true }, { title: 'Brutalist Title' })
    expect(site.title).to.equal('Newzit Title')
    expect(site.feeds).to.eql(['drudge', 'newzit', 'brutalist'])
  })
})

describe('publishing', function () {
  const good = { id: 'foo', title: 'Foo', url: 'https://foo.com/', description: 'Foo news.', tier: 'B', tags: ['news'] }

  it('should drop sites the site build would reject', function () {
    const sites = [good, { ...good, id: 'blank', title: ' ' }, { ...good, id: 'http', url: 'http://foo.com/' }, { ...good, id: 'untagged', tags: [] }, { ...good, id: 'odd', tags: ['nope'] }]
    const { valid, problems } = checkPublished(sites, tags)
    expect(valid).to.eql([good])
    expect(problems.length).to.equal(4)
  })

  it('should pass every stored site', function () {
    const stored = readJson('sources.json').map(site => _.omit(site, ['flaggedForRetiringAt', 'retiredAt']))
    expect(checkPublished(stored, tags).problems).to.eql([])
  })
})

describe('retirement', function () {
  const now = new Date('2026-11-12T06:00:00.000Z')
  const daysAgo = days => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
  const site = fields => _.assign({ id: 'a', known: true, feeds: [] }, fields)

  it('should flag an unlisted site with the run time', function () {
    const sites = [site()]
    expect(updateRetirement(sites, { now }).flagged).to.eql(['a'])
    expect(sites[0].flaggedForRetiringAt).to.equal(now.toISOString())
  })

  it('should keep the first flag time', function () {
    const sites = [site({ flaggedForRetiringAt: daysAgo(10) })]
    updateRetirement(sites, { now })
    expect(sites[0].flaggedForRetiringAt).to.equal(daysAgo(10))
  })

  it('should clear the flag when a feed lists the site', function () {
    const sites = [site({ feeds: ['newzit'], flaggedForRetiringAt: daysAgo(10) })]
    expect(updateRetirement(sites, { now }).cleared).to.eql(['a'])
    expect(sites[0].flaggedForRetiringAt).to.be.undefined()
  })

  it('should retire after 90 days flagged', function () {
    const sites = [site({ id: 'old', flaggedForRetiringAt: daysAgo(90) }), site({ id: 'new', flaggedForRetiringAt: daysAgo(89) })]
    expect(updateRetirement(sites, { now, days: 90 }).retired).to.eql(['old'])
    expect(sites[0]).to.have.property('retired', true)
    expect(sites[0].retiredAt).to.equal(now.toISOString())
    expect(sites[1].retired).to.be.falsy()
  })

  it('should retire at most perRun a run, oldest flag first', function () {
    const sites = [site({ id: 'b', flaggedForRetiringAt: daysAgo(95) }), site({ id: 'a', flaggedForRetiringAt: daysAgo(99) }), site({ id: 'c', flaggedForRetiringAt: daysAgo(91) })]
    const changes = updateRetirement(sites, { now, days: 90, perRun: 2 })
    expect(changes.retired).to.eql(['a', 'b'])
    expect(changes.held).to.eql(['c'])
    expect(sites[2].retired).to.be.falsy()
  })

  it('should restore a retired site a feed lists again', function () {
    const sites = [site({ feeds: ['drudge'], retired: true, flaggedForRetiringAt: daysAgo(200), retiredAt: daysAgo(110) })]
    expect(updateRetirement(sites, { now }).restored).to.eql(['a'])
    expect(sites[0]).to.have.property('retired', false)
    expect(sites[0].flaggedForRetiringAt).to.be.undefined()
    expect(sites[0].retiredAt).to.be.undefined()
  })

  it('should never flag a seeded site, and restore a retired one', function () {
    const sites = [site({ id: 'seeded', seeded: true }), site({ id: 'back', seeded: true, retired: true, retiredAt: daysAgo(5) })]
    const changes = updateRetirement(sites, { now })
    expect(changes.flagged).to.eql([])
    expect(changes.restored).to.eql(['back'])
  })

  it('should not flag new sites on a night a feed failed', function () {
    const sites = [site({ id: 'quiet' }), site({ id: 'back', feeds: ['newzit'], flaggedForRetiringAt: daysAgo(3) })]
    const changes = updateRetirement(sites, { now, feedFailed: true })
    expect(changes.flagged).to.eql([])
    expect(changes.cleared).to.eql(['back'])
  })

  it('should leave sites found tonight alone', function () {
    const sites = [site({ known: false })]
    expect(updateRetirement(sites, { now }).flagged).to.eql([])
  })

  it('should let seed.json match and mark a retired site', function () {
    const stored = [{ id: 'gone', title: 'Gone', url: 'https://gone.example/', retired: true }]
    const [match] = applySeed(stored, [{ id: 'gone', title: 'Gone', url: 'https://gone.example/' }])
    expect(match).to.have.property('retired', true)
    expect(match).to.have.property('seeded', true)
  })
})

describe('feeds', function () {
  it('should define every feed the same way', function () {
    expect(_.uniqBy(feeds, 'id').length).to.equal(feeds.length)
    for (const feed of feeds) {
      expect(feed.id).to.be.string()
      expect(feed.trusted).to.be.boolean()
      expect(['json', 'xml', 'html', 'csv']).to.include(feed.format)
      expect(feed.pages.length).gt(0)
      expect(feed.parse).to.be.function()
      for (const tag of _.flatMap([feed, ...feed.pages], 'tags').filter(Boolean)) {
        expect(tagIds).to.include(tag)
      }
    }
  })

  it('should add feed and page tags to every link', async function () {
    const test = {
      tags: ['news'],
      pages: [{ url: 'a', tags: ['tech'] }, { url: 'b' }],
      parse: body => [{ title: body, url: `https://${body}.com/`, tags: ['sports'] }]
    }
    const links = await feeds.runFeed(test, async url => url)
    expect(links.map(link => link.tags)).to.eql([['news', 'tech', 'sports'], ['news', 'sports']])
  })

  it('should read Newzit editions as region tags', function () {
    expect(feed('newzit').parse([
      { name: 'BBC', url: 'https://www.bbc.co.uk/news', geo: 'gb' },
      { name: 'CNN', url: 'https://www.cnn.com/us', geo: 'us' }
    ])).to.eql([
      { title: 'BBC', url: 'https://www.bbc.co.uk/news', tags: ['british'] },
      { title: 'CNN', url: 'https://www.cnn.com/us', tags: ['american'] }
    ])
  })

  it('should read one site per Brutalist source block', function () {
    const block = (name, urls) => `<div><h3><a href="/source/x">${name}</a></h3><ul>` +
      urls.map(url => `<li><a href="${url}">Headline</a> [1h]</li>`).join('') + '</ul></div>'
    const html = block('BBC', ['https://www.bbc.co.uk/a', 'https://www.bbc.co.uk/b']) +
      block('Hacker News', ['https://github.com/a', 'https://example.com/b', 'https://nytimes.com/c'])

    expect(feed('brutalist').parse(html)).to.eql([
      { title: 'BBC', url: 'https://www.bbc.co.uk/' }
    ])
  })

  it('should read a Techmeme leaderboard', function () {
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?><opml><body>
      <outline text="Bloomberg" type="rss" htmlUrl="https://www.bloomberg.com/" xmlUrl="https://x/rss"/>
      <outline text="Tom&apos;s Hardware" type="link" url="https://www.tomshardware.com/"/>
    </body></opml>`

    expect(feed('techmeme').parse(xml)).to.eql([
      { title: 'Bloomberg', url: 'https://www.bloomberg.com/' },
      { title: "Tom's Hardware", url: 'https://www.tomshardware.com/' }
    ])
  })

  it('should read every outbound Drudge link as a site', function () {
    const html = `
      <A HREF="https://www.nytimes.com/2026/11/12/us/story.html">Big story about things...</A><HR>
      <A HREF="https://qz.com/texas-grid-story-111126">Texas Grid Boss Wants Data Centers...</A><HR>
      <A HREF="http://www.nytimes.com">NY TIMES</a> <A HREF="https://www.nytimes.com/search?q=">WIRE</A><BR>
      <A HREF="http://www.dailymail.co.uk/home/index.html">[UK] DAILY MAIL</A><BR>
      <A HREF="http://www.drudgereportArchives.com/">ARCHIVES</A><BR>
      <A HREF="/quake.htm">DRUDGE QUAKE SHEET</A>
      <a href="mailto:drudge@drudgereport.com">EMAIL</a>`

    expect(feed('drudge').parse(html)).to.eql([
      { title: 'NY TIMES', url: 'https://www.nytimes.com/', tags: [] },
      { title: 'qz.com', url: 'https://qz.com/', tags: [] },
      { title: 'DAILY MAIL', url: 'https://www.dailymail.co.uk/', tags: ['british'] }
    ])
  })

  it('should import palewire sites picked by rules, and mark the rest enrichOnly', function () {
    const body = 'twitter,url,name,location,timezone,country,language,bundle,wait,no_adguard\n' +
      'rtenews,https://www.rte.ie/,RTE,Dublin,Europe/Dublin,IE,en,,,\n' +
      'cnn,https://www.cnn.com,CNN,Atlanta,America/New_York,US,en,us-national|us-left-wing,,\n' +
      'localpaper,https://example.com,Local Paper,Town,America/Chicago,US,en,gannett,,\n' +
      'guardian,https://www.theguardian.com/,The Guardian,London,Europe/London,GB,en,,,\n'
    const rules = [
      { country: 'IE', tags: ['news'] },
      { bundle: 'us-national', tags: ['news'] },
      { bundle: 'us-left-wing', tags: ['politics'] }
    ]

    expect(feed('palewire').parse(body, rules)).to.eql([
      { title: 'RTE', url: 'https://www.rte.ie/', tags: ['irish', 'news'], enrichOnly: false },
      { title: 'CNN', url: 'https://www.cnn.com', tags: ['american', 'news', 'politics'], enrichOnly: false },
      { title: 'Local Paper', url: 'https://example.com', tags: ['american'], enrichOnly: true },
      { title: 'The Guardian', url: 'https://www.theguardian.com/', tags: ['british'], enrichOnly: true }
    ])
  })
})

// Network: fetches each feed once.
describe('live feeds', function () {
  this.timeout(60000)

  for (const each of feeds) {
    it(`should get news sites from ${each.id}`, async function () {
      const links = await feeds.runFeed(each)
      expect(links.length).gt(20)
      links.forEach(expectSite)
    })
  }

  it('should only use palewire bundles that exist', async function () {
    const palewire = feed('palewire')
    const slugs = csv.parse(await fetchBody(palewire.bundlesUrl, 'csv'), { columns: true }).map(row => row.slug)
    for (const rule of palewire.rules) {
      if (rule.bundle) expect(slugs).to.include(rule.bundle)
      for (const tag of rule.tags) expect(tagIds).to.include(tag)
    }
  })
})
