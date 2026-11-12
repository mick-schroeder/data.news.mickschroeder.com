#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const config = require('../config')
const Index = require('../index')
const s3 = require('../lib/s3')
const cloudfront = require('../lib/cloudfront')
const { readJson } = require('../lib/sites')

const OUT_FOLDER = path.join(__dirname, '../out')

const writeLocal = function (filename, body) {
  fs.mkdirSync(OUT_FOLDER, { recursive: true })
  fs.writeFileSync(path.join(OUT_FOLDER, filename), body)
}

const uploaded = []

const publish = async function (filename, body, contentType) {
  writeLocal(filename, body)
  if (config.AWS_KEY) {
    await s3.upload(filename, body, contentType)
    uploaded.push(filename)
  }
}

const publishJson = async function (filename, data) {
  console.log({ filename, count: data.length })
  await publish(filename, JSON.stringify(data))
}

const main = async function () {
  if (config.AWS_KEY && !config.CLOUDFRONT_DISTRIBUTION_ID) {
    throw new Error('Set CLOUDFRONT_DISTRIBUTION_ID; uploads are cached for a day.')
  }
  fs.rmSync(OUT_FOLDER, { recursive: true, force: true })
  const listBuilder = new Index()
  const tags = readJson('tags.json')
  const sources = await listBuilder.filter()

  // Save verdicts before publishing, so a failed upload doesn't lose them.
  const added = await listBuilder.saveSources()
  console.log({ addedToData: added.length })
  console.log({ retirement: await listBuilder.retirement() })

  // Tags first, so a new tag exists before any site that uses it.
  await publishJson('tags.json', tags)
  await publishJson('sources.json', sources)
  await publishJson(`sources-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.json`, sources)
  await publish('index.html', fs.readFileSync(path.join(__dirname, '../index.html')), 'text/html; charset=utf-8')
  if (uploaded.length) {
    console.log({ invalidated: await cloudfront.invalidate(uploaded) })
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
