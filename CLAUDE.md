# AI Data Center Power Tracker

A public tracker of large AI data center projects and how they are powered.
It is a static website with no build step, hosted for free on GitHub Pages.
The data is updated by running the `/update-tracker` skill in Claude Code.

## Files

| Path | What it is |
|---|---|
| `index.html`, `assets/` | The website (vanilla HTML/CSS/JS, Leaflet map) |
| `data/projects.json` | One record per data center project (the dataset) |
| `data/changelog.json` | Every change made to the dataset, newest first |
| `scripts/validate.mjs` | Checks the dataset against the rules below. Run after every edit |
| `scripts/serve.mjs` | Local preview server: `node scripts/serve.mjs` then open http://localhost:8080 |
| `.claude/skills/update-tracker/` | The weekly update procedure |

## Data rules

These apply to every edit of `data/projects.json`. Accuracy is the whole point of
this project: a wrong number in a public tracker costs more than a missing one.

1. **Every fact needs a source you actually opened.** Each project lists at least
   one source. Capacity, status, location and power claims must each be supported
   by a listed source. Never fill a field from memory.
2. **Source quality.** Prefer primary sources: company announcements, utility or
   regulatory filings, government releases. Next best: established press (Reuters,
   Bloomberg, AP, FT, WSJ, CNBC, Data Center Dynamics, Data Center Frontier, The
   Register, reputable local newspapers). Blogs, social posts, press-release
   aggregators and AI-written summary sites are never the only source.
3. **Unknown means `null`.** Never guess capacity, dates, investment or utility.
4. **What qualifies.** A publicly announced campus built for AI or hyperscale
   compute, at least 100 MW planned, with a known location (at least the city or
   county). Crypto-mining sites qualify only if they are being converted to AI/HPC.
   If no total power figure has been published, include the project only if a
   source shows it is that large in another way (a grid connection or on-site plant
   of 100 MW or more, or an investment of $1 billion or more), and leave
   `capacity_mw` as `null`.
5. **Capacity.** `capacity_mw` is the planned full-build power in MW as stated by
   the source (1 GW = 1000 MW). If the source says "up to" or gives a range, use the
   upper figure and say so in `notes`. Set `capacity_basis` to `it` if the source
   says IT/critical load, `facility` if it says total/utility power, otherwise
   `unspecified`.
6. **Status** is as of `last_verified`. Search for recent news before setting it.
7. **Coordinates** are the city or county centre unless the exact site is public.
   Record which in `location_precision`.
8. **Never change a published `id`.** Other people may link to it.
9. **Log every change** in `data/changelog.json` (newest first).
10. **Neutral wording.** Facts only, no opinions or predictions.
11. Run `node scripts/validate.mjs` after editing and fix every error.

## Project record

```json
{
  "id": "kebab-case-unique-id",
  "name": "Project or campus name",
  "developer": "Who builds/owns the campus",
  "tenants": ["Who will use the compute, if public"],
  "city": "Abilene",
  "region": "Texas",
  "country": "United States",
  "lat": 32.45,
  "lng": -99.73,
  "location_precision": "site | city | county | region",
  "capacity_mw": 1200,
  "capacity_basis": "facility | it | unspecified",
  "power_sources": ["grid", "natural_gas"],
  "onsite_generation": true,
  "utility": "Utility or grid operator serving the site, or null",
  "power_notes": "One or two factual sentences on how the site is powered, or null",
  "status": "announced | under_construction | partially_operational | operational | paused | cancelled",
  "announced": "2025-01",
  "expected_online": "2026",
  "investment_usd_bn": 40,
  "sources": [
    { "title": "Article title", "publisher": "Reuters", "url": "https://...", "date": "2025-09-23" }
  ],
  "last_verified": "2026-10-26",
  "notes": "Anything a reader needs to interpret the numbers, or null"
}
```

- `power_sources` uses only: `grid`, `natural_gas`, `nuclear`, `solar`, `wind`,
  `hydro`, `geothermal`, `battery_storage`, `fuel_cell`, `other`. Empty list if unknown.
- `onsite_generation` is `true` when the project has or plans dedicated generation
  on site or behind the meter, `false` when the source says it is grid-only, else `null`.
- `announced` is `YYYY-MM` or `YYYY`. `expected_online` is free text such as `2026`
  or `2027-H2`, or `null`. Dates in `sources` are `YYYY-MM-DD`, or `YYYY-MM` / `YYYY`
  when the exact day is not shown.

## Changelog entry

```json
{ "date": "2026-10-26", "project_id": "stargate-abilene", "type": "added | updated | status_change | removed", "summary": "One sentence on what changed", "source_url": "https://..." }
```

`project_id` is `null` only for a note about the whole dataset (for example the launch).
