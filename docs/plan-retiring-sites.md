# Plan: retiring stale sites

## Problem

Sites get into `data/sources.json` but never leave. An outlet that closes,
or that the aggregators stop linking, stays in every published file forever.

## Rule

Feeds are trusted. If no feed has listed a site for **3 months**, it's
retired. If a feed lists it again, it comes back with the same id.

A site is only written to when its status changes:

- **Not listed tonight, no flag:** set `flaggedForRetiringAt` to the run's
  ISO 8601 UTC timestamp.
- **Listed tonight, flagged:** remove `flaggedForRetiringAt`.
- **Flag older than 3 months:** move the site from `sources.json` to
  `retired.json` and add `retiredAt`.
- **A feed lists a retired site:** move it back to `sources.json` and remove
  both fields. Same id, title, tier and tags.
- **Otherwise:** nothing changes.

Two exceptions:

- Sites in `seed.json` are never flagged. Seed works as a pin.
- On a night when any feed failed, no new flags are set. Clearing and
  restoring still happen. A broken feed shouldn't put its sites on the
  retirement clock.

```
            not listed            3 months flagged
  listed  ------------> flagged -----------------> retired.json
    ^       listed again   |                           |
    +----------------------+---------------------------+
                      listed again
```

## Red team

| Risk | What happens | Verdict |
| -- | -- | -- |
| Nightly churn | Only status changes are written. Most feeds are steady lists (leaderboards, Newzit's and Brutalist's publisher lists, palewire), so most nights nothing changes. | Fixed. |
| Drudge flapping | 38 sites are listed only by Drudge, which links in bursts. Each one can be flagged and cleared again and again. That's a few lines of churn on Drudge's quiet nights. | Accepted. Each flap is one line, and nothing is published (see below). Watch after launch (TODO). |
| Amplify builds | Amplify builds `news.mickschroeder.com` on pushes to that repo. Bot commits to this repo don't trigger it, and neither the flag nor `retiredAt` is published. | No build is triggered unless a data webhook is added later. If one is, trigger it only when published `sources.json` changes. |
| Pipeline down for 3+ months | Nothing runs, so nothing is flagged. The first night back flags whatever isn't listed, and those sites get a fresh 3 months. | Fixed. There's no mass retirement after an outage. |
| A feed broken for one night | Without the exception, its single-feed sites would all be flagged, then cleared the next night. | Handled by "no new flags on a night a feed failed". |
| Feed broken for months | No new flags at all during that time, so retirement pauses. The broken feed already emails every night. | Accepted. Safe failure: it pauses rather than retiring sites. |
| Aggregator shuts down for good | Remove it from the code, then its sites get flagged and retire after 3 months, unless another feed lists them. | Correct by this rule. Seed any you want to keep. |
| Palewire is static | Sites only palewire lists will almost never retire. | Accepted. Health checks are in TODO. |
| Outlet moves domain | The old URL retires; the new domain arrives as a new site with a new id. | Accepted; it's rare. |
| Seed lists a retired site | It would end up in both files. | `applySeed` also matches retired sites and restores them. |
| A site in both files | A bug or hand edit. | A test fails if an id or URL is in both. |
| Fields leak into published files | `sanatizeForResponse` picks `FIELDS`. | `flaggedForRetiringAt` and `retiredAt` are stored only, never published. |
| Fields dropped on save | `saveSources` stores `siteFields`, which only keeps `FIELDS`. | Store `[...FIELDS, 'flaggedForRetiringAt']`. |
| Launch | Do existing sites need backfilling? | No. Missing flag means "listed". 307 of 308 were listed tonight; the other, `mickschroeder`, is in seed. |

## Implementation

### Data

- `data/retired.json`: new, starting as `[]`. Each entry is the stored record
  plus `flaggedForRetiringAt` and `retiredAt`.
- `data/sources.json`: `flaggedForRetiringAt` appears only on sites that are
  currently unlisted.

### `index.js`

1. `STORED = [...FIELDS, 'flaggedForRetiringAt']`. `saveSources` writes
   `STORED`; publishing still uses `FIELDS`.
2. `gatherSites`: load `retired.json` into the same `SiteIndex`, marked
   `{ known: true, accepted: true, retired: true }`, so feed matching finds
   them through the normal URL, host and domain matching. When a feed lists a
   site, set `site.listed = true`.
3. `applySeed`: also match retired sites. A match clears `retired`.
4. New `updateRetirement(sites, { runStarted, feedFailed, seedIds })`:
   - listed → clear the flag, and if retired, restore it (clear `retired`
     and `retiredAt`)
   - not listed, not seeded, no flag, `!feedFailed` → set the flag to
     `runStarted`
   - flag older than `RETIRE_AFTER_DAYS` → `retired = true`, and
     `retiredAt = runStarted` if it isn't already set
5. `filter()` and `all()` leave out retired sites. Retired ids stay in
   `taken` because they're in the list.
6. `saveSources` writes `sources.json` with the known sites that aren't
   retired, plus the new ones, and `retired.json` with the retired sites.
   Each file is only written if it changed, as now.

### `config.js`

- `RETIRE_AFTER_DAYS: 90`.

### `bin/deploy.js`

- Log `{ flagged, cleared, retired, restored }` as lists of ids.

### Workflow

- Rename the bot commit message to "Update sites".

### Tests

- Unlisted → flagged with the run timestamp. Listed → flag cleared.
- An already-flagged site keeps its original timestamp.
- Flagged 90+ days → retired; 89 days → not.
- A retired site listed again is restored with the same id and no fields.
- A seeded site is never flagged.
- No new flags on a night a feed failed. Clearing still works.
- A seed entry that matches a retired site restores it.
- Neither field appears in the published output.
- No id or URL is in both `sources.json` and `retired.json`.
- A new site never gets a retired id.

### README

A short "Retired sites" section explaining the 3-month rule, that a site comes
back when it's listed again, that seed pins a site, and that retired sites are
in `data/retired.json`.

## Not doing (in TODO)

- A guard limiting how many sites can be retired in one night.
- An AI guard that checks retirements before they happen.
- Homepage health checks.
- Handling Drudge flapping, if it turns out to matter.
