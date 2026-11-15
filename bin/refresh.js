#!/usr/bin/env node
// Re-judges stored sites: tier, description and tags only. Run by hand.
const fs = require('fs')
const path = require('path')
const config = require('../config')
const anthropic = require('../lib/anthropic')
const editor = require('../lib/editor')
const { readJson, writeJson } = require('../lib/sites')
const { gatherSites } = require('../index')

const OUT_FOLDER = path.join(__dirname, '../out')

const main = async function () {
  const tags = readJson('tags.json')
  const before = readJson('sources.json')
  fs.mkdirSync(OUT_FOLDER, { recursive: true })
  fs.writeFileSync(path.join(OUT_FOLDER, 'sources-before-refresh.json'), JSON.stringify(before, null, 2))

  // Feeds give the editor listedBy and tag hints.
  const problems = []
  const sites = (await gatherSites(problems)).filter(site => !site.retired)
  const stored = sites.filter(site => site.known)
  const { verdicts, problems: editorProblems } = await editor.evaluate(sites, tags, anthropic.prompt, stored)
  problems.push(...editorProblems)

  const { next, report } = editor.applyRefresh(before, stored, verdicts)
  report.problems = problems

  writeJson('sources.json', next)
  fs.writeFileSync(path.join(OUT_FOLDER, 'refresh-report.json'), JSON.stringify(report, null, 2))
  console.log({
    refreshed: next.length - report.unanswered.length - report.wouldReject.length,
    tierChanges: report.tiers.length,
    tagChanges: report.tags.length,
    wouldReject: report.wouldReject.length,
    unanswered: report.unanswered.length,
    problems
  })
}

main().catch(function (err) {
  console.error(err)
  process.exit(1)
})
