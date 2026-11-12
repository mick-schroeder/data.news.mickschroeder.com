# popular-news-sites

Popular News Sites uses LLMs to build a list of news websites from the sites
that news aggregators link to. Each site is judged once, then given a tier,
a short description and tags.

## Usage

You can poll the following JSON file for a list of sites.

```
https://data.news.mickschroeder.com/sources.json
```

  * This file is regenerated nightly so it is recommended that you
    only poll this file once per day
  * Each site has an `id`, `title`, `url`, `description`, `tier` and `tags`

If you're looking for historical files, you can amend a date to the
main file like so:

```
https://data.news.mickschroeder.com/sources-20261112.json
```

## Tiers

Sites are ranked `S`, `A`, `B`, `C`, `D` or `F`, best to worst. `E` means
the LLM didn't know the site well enough to rank it.

## Tags

Tags are listed in [tags.json](https://data.news.mickschroeder.com/tags.json).

| Tag | Description |
| -- | -- |
| `popular` | Tier S or A |
| `news` | General news |
| `politics`, `business`, `tech`, `science`, `culture`, `sports`, `gaming` | Topics |
| `american`, `british`, `irish` | Where the site is based |
| `gaeilge` | Written in Irish |
| `newzit`, `techmeme`, `drudge-report`, ... | Aggregators listing the site |

## Sources

* [Newzit](https://www.newzit.com/)
* [The Brutalist Report](https://brutalist.report/)
* [Techmeme](https://www.techmeme.com/)
* [Memeorandum](https://www.memeorandum.com/)
* [Mediagazer](https://mediagazer.com/)
* [Drudge Report](https://www.drudgereport.com/)
* [news-homepages](https://github.com/palewire/news-homepages)

A site no source has listed for 3 months is retired. Sites can also be
added by hand in `data/seed.json`.

## Develop

* Add a `.env` file which includes the following lines

    ```
    ANTHROPIC_API_KEY=
    AWS_KEY=
    AWS_SECRET=
    ```

* Then run `pnpm install` and `pnpm test`
* `pnpm run deploy` builds the list. Without AWS keys, files are written to `out/`
* `pnpm run refresh` re-ranks every site

## License

MIT

Forked from [popular-movies](https://github.com/sjlu/popular-movies) by Steven Lu.
