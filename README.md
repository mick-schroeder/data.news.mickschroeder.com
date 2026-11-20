# popular-news-sites

Popular News Sites uses LLMs to build a list of news sources from the sites
that news feeds like Newzit and Drudge link to. Each source is judged, given a tier,
a short description and tags.

## Usage

You can poll the following JSON file for a list of sources.

```
https://data.news.mickschroeder.com/sources.json
```

  * This file is regenerated nightly so it is recommended that you
    only poll this file once per day
  * Each source has an `id`, `title`, `url`, `description`, `tier`, `tags`,
    `icon` (a 64px favicon URL) and `similar` (up to 6 ids of sources sharing
    a topic, best match first); tiers and tags are described in `tiers.json`
    and `tags.json`

If you're looking for historical files, you can amend a date to the
main file like so:

```
https://data.news.mickschroeder.com/sources-20261112.json
```

## Tiers

Tiers are listed in [tiers.json](https://data.news.mickschroeder.com/tiers.json),
best first. Each has an `id` (`S`, `A`, `B`, `C`, `D`, `E` or `F`), an `order`,
a `title` and a `description`. `E` means the LLM didn't know the source well enough to
rank it.

## Tags

Tags are listed in [tags.json](https://data.news.mickschroeder.com/tags.json),
only those some source uses. Each has an `id`, `order`, `title`, `kind`, `icon` ([Lucide](https://lucide.dev/icons/)
name) and `description`; feed tags also have the feed's `url` and topic tags a `color` ([Tailwind](https://tailwindcss.com/docs/colors) colour name)
and country regions a `country` (ISO 3166-1 alpha-2 code).

| Kind | Tags | Meaning |
| -- | -- | -- |
| `topic` | `news`, `politics`, `business`, `tech`, `science`, `culture`, `sports`, `gaming` | What the source covers |
| `region` | `american`, `british`, `irish`, `international`, ... | Where the source is based; optional |
| `feed` | `newzit`, `techmeme`, `drudge-report`, ... | Feeds that listed the source |
| `language` | `gaeilge` | Written in Irish |
| `sponsor` | `sponsor` | Hand-applied |

## Feeds

* [Newzit](https://www.newzit.com/)
* [The Brutalist Report](https://brutalist.report/)
* [Techmeme](https://www.techmeme.com/)
* [Memeorandum](https://www.memeorandum.com/)
* [Mediagazer](https://mediagazer.com/)
* [Drudge Report](https://www.drudgereport.com/)
* [news-homepages](https://github.com/palewire/news-homepages)

A source no feed has listed for 3 months is retired. Sources can also be
added by hand in `data/seed.json`.

## Develop

* Add a `.env` file which includes the following lines

    ```
    ANTHROPIC_API_KEY=
    AWS_KEY=
    AWS_SECRET=
    CLOUDFRONT_DISTRIBUTION_ID=
    ```

* Then run `pnpm install` and `pnpm test`
* `pnpm run deploy` builds the list. Without AWS keys, files are written to `out/`. With them, it uploads (cached a day) and invalidates CloudFront
* `pnpm run refresh` re-ranks every source
* In GitHub Actions, set the `AMPLIFY_WEBHOOK_URL` secret to rebuild
  news.mickschroeder.com whenever `sources.json` or `tags.json` changes

## License

Code: MIT.

Data (`sources.json`, `tags.json` and the dated files, including the
AI-written descriptions): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Credit "Popular News Sites" with a link to this repository.

Forked from [popular-movies](https://github.com/sjlu/popular-movies) by Steven Lu.
