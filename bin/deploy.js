#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const config = require('../config')
const Index = require('../index')
const s3 = require('../lib/s3')
const cloudfront = require('../lib/cloudfront')
const { readJson } = require('../lib/sites')
const { publishData } = require('../lib/publish')

const OUT_FOLDER = path.join(__dirname, '../out')

const writeLocal = function (filename, body) {
  fs.mkdirSync(OUT_FOLDER, { recursive: true })
  fs.writeFileSync(path.join(OUT_FOLDER, filename), body)
}

const uploaded = []

// Files the site builds from; it only needs a rebuild when one changes.
const SITE_FILES = ['sources.json', 'tags.json', 'tiers.json']
let siteChanged = false

const differsFromLive = async function (filename, body) {
  try {
    const response = await fetch(`${config.PUBLIC_URL}/${filename}`)
    return !response.ok || (await response.text()) !== body
  } catch (err) {
    return true
  }
}

const publish = async function (filename, body, contentType) {
  writeLocal(filename, body)
  if (config.AWS_KEY) {
    await s3.upload(filename, body, contentType)
    uploaded.push(filename)
  }
}

const publishJson = async function (filename, data) {
  console.log({ filename, count: data.length })
  const body = JSON.stringify(data)
  if (config.AWS_KEY && SITE_FILES.includes(filename) && await differsFromLive(filename, body)) {
    siteChanged = true
  }
  await publish(filename, body)
}

const main = async function () {
  if (config.AWS_KEY && !config.CLOUDFRONT_DISTRIBUTION_ID) {
    throw new Error('Set CLOUDFRONT_DISTRIBUTION_ID; uploads are cached for a day.')
  }
  fs.rmSync(OUT_FOLDER, { recursive: true, force: true })
  const listBuilder = new Index()
  const accepted = await listBuilder.filter()
  const { sources, tags, tiers } = publishData(accepted, readJson('tags.json'), readJson('tiers.json'))

  // Save verdicts before publishing, so a failed upload doesn't lose them.
  const added = await listBuilder.saveSources()
  console.log({ addedToData: added.length })
  console.log({ retirement: await listBuilder.retirement() })

  // Tags and tiers first, so they exist before any site that uses them.
  await publishJson('tiers.json', tiers)
  await publishJson('tags.json', tags)
  await publishJson('sources.json', sources)
  await publishJson(`sources-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`, sources)
  await publish('index.html', fs.readFileSync(path.join(__dirname, '../index.html')), 'text/html; charset=utf-8')
  if (uploaded.length) {
    console.log({ invalidated: await cloudfront.invalidate(uploaded) })
  }
  console.log({ siteChanged })
  if (siteChanged && process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'site_changed=true\n')
  }

  const published = (await listBuilder.all()).filter(site => site.accepted)
  console.log({
    published: published.length,
    listedBy: _.countBy(published.flatMap(site => site.feeds))
  })

  // Published anyway; fail the job so GitHub sends an email.
  const problems = await listBuilder.problems()
  if (problems.length) {
    console.error({ problems })
    process.exitCode = 1
  }
}

main().catch(function (err) {
  console.error(err)
  process.exit(1)
})
