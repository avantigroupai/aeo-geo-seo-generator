# AEO · GEO · SEO Generator

Point it at any URL. It fetches the page, audits **45+ signals** across three lenses, generates the
markup and copy blocks that fix what it found — and then tells you, item by item, what no generated
file can fix.

Websites are turning from pages humans visit into resources agents use. This makes a site readable
by those agents, and is explicit about where the machine work stops and the writing, engineering
and commercial decisions begin.

| Lens    | Question it answers                                          |
| ------- | ------------------------------------------------------------ |
| **SEO** | Can engines crawl, understand and rank this page?             |
| **AEO** | Can a machine lift a correct, self-contained answer off it?   |
| **GEO** | Will a language model ingest it, trust it, and cite it by name? |

## Run it

```bash
npm install && npm start
```

Then open <http://localhost:4321> and paste a URL. `PORT=8080 npm start` to move it.

```bash
npm test
```

## What it checks

**SEO** — title and description length, single H1, heading order, canonical (self-referencing,
duplicated, absolute), `noindex`, robots.txt verdict for Googlebot on *this* path, XML sitemap
discovery, Open Graph and X cards, HTTPS, redirect chain, viewport, `lang`, alt coverage, content
depth, internal linking, structured data validity, render-blocking scripts, URL shape, hreflang.

**AEO** — FAQ/QA schema, question-phrased headings, whether a direct answer follows each one,
answer-first opening, TL;DR block, lists and tables, readability (Flesch + sentence length),
paragraph chunking, semantic landmarks, anchored headings, speakable markup, HowTo opportunities,
and sentences that start with a pronoun and lose their meaning when extracted.

**GEO** — per-vendor AI crawler access (GPTBot, OAI-SearchBot, ClaudeBot, Claude-User,
PerplexityBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent, Bytespider),
`/llms.txt`, entity identity and `sameAs`, named authorship, freshness, statistics density,
sourced claims and outbound authority links, quotable statements, original research signals,
comparison coverage, server-rendered content, and retrieval chunk sizing.

Every check reports **what it found**, **why it matters** and **what to do** — and carries a
weight, so the 0–100 score per lens reflects impact rather than check count.

## What it generates

| Artifact                              | File                    |
| ------------------------------------- | ----------------------- |
| Connected JSON-LD `@graph` — Organization, WebSite, BreadcrumbList, WebPage, Article, FAQPage | `schema-graph.html` |
| FAQPage on its own                    | `schema-faq.html`       |
| HowTo steps (when procedural content is detected) | `schema-howto.html` |
| Optimised `<head>`: rewritten title/description, canonical, robots directives, OG, X cards, freshness stamps | `head.html` |
| `llms.txt` — a curated markdown map for language models | `llms.txt`     |
| `robots.txt`, maximum reach — every AI crawler allowed | `robots.txt`   |
| `robots.txt`, cite-yes-train-no — retrieval bots allowed, training bots opted out | `robots-balanced.txt` |
| Answer-first opening, key-takeaways box, visible FAQ, anchored TOC | `*.html` |
| FAQ as markdown                       | `faq.md`                |
| Prioritised action plan               | `action-plan.md`        |
| The handover — what the files close vs. what stays yours | `handover.md` |
| Full machine-readable report          | `report.json`           |

Fill in the **Profile** tab (brand, logo, author, `sameAs` profiles, dates, search URL) and every
artifact regenerates against it. Profiles are stored in `localStorage`, per domain.

## What it says you still have to do

The **What's left** tab is the other half of the job. Every failing or weak check is sorted into one
of four buckets, and the tab shows the count for each:

1. **Closed by the generated files** — the finding, the file that fixes it, and exactly where it
   goes. A file with an unmet prerequisite ships with the blocker attached rather than pretending
   to be finished.
2. **We need this from you** — missing profile inputs, plus every `TODO` placeholder still sitting
   in a generated file. FAQ schema whose answers are not visible on the page is invalid, so the
   placeholders are deliberate.
3. **Still yours** — the work no generator closes, each with an owner (Editorial, Engineering,
   Research, Leadership), a rough effort, and a plain statement of *why* a file cannot do it.
   Statistics, sourced claims, original research, server-rendered copy, alt text, readability.
4. **Decisions only you can make** — which AI crawlers you admit (reach, cite-yes-train-no, or
   meter and charge at the edge), whether you publish the whole answer, and who signs the page.

All of it exports as `handover.md`, ready to send with the file pack.

## How it works

```
server.js              zero-dependency HTTP server + 15-minute page cache
src/fetcher.js         fetch with redirect chain tracking and an SSRF guard
src/extract.js         HTML → page model (cheerio), robots.txt parser + matcher
src/audit/{seo,aeo,geo}.js   the checks; each returns {status, found, fix, weight, impact}
src/generate/*         pure functions: page model + profile → artifacts
src/generate/handover.js     maps every check to a file that closes it, or to the person who must
public/                the UI — vanilla JS, no build step
```

The only dependency is `cheerio`.

### Notes

- Private and loopback addresses are refused. Set `ALLOW_PRIVATE=1` to audit a local dev server.
- The fetch is a plain HTTP request with no JavaScript execution — deliberately, because that is
  what most AI crawlers see. A low word count here is a real finding, not a limitation.
- Generated answers marked `TODO` are placeholders on purpose. FAQ schema whose answers are not
  visible on the page is invalid, and inventing answers for you would be worse than leaving a gap.
