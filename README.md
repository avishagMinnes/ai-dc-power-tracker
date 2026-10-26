# AI Data Center Power Tracker

A public, sourced map of the largest AI data center projects in the world: where
they are being built, how much power they need, and where that power comes from.

AI is turning data centers into some of the largest new electricity loads on the
grid. The facts about each project are scattered across press releases, utility
filings and local news. This tracker collects them in one place and links every
number to its source.

**Live site:** https://avishagminnes.github.io/ai-dc-power-tracker/

## What it shows

- **Map** of every project, sized by planned power and coloured by status
  (announced, under construction, operating).
- **Summary figures**: planned gigawatts, how much is already being built or
  running, and how many projects plan their own on-site power.
- **Charts** of planned power by power source (grid, natural gas, nuclear, solar…)
  and by country.
- **Searchable table** with filters, project details, sources, and CSV/JSON download.
- **Changelog** of every addition and change, so readers can see what is new.

## How the data is collected

1. Once a week, the `/update-tracker` Claude Code skill
   (`.claude/skills/update-tracker/SKILL.md`) searches recent news, company
   announcements and utility filings for new projects and status changes.
2. It records only facts confirmed in a source it opened, following the rules in
   [`CLAUDE.md`](CLAUDE.md). Unknown values stay empty, never estimated.
3. `scripts/validate.mjs` checks every record (required fields, allowed values,
   coordinates, dates, at least one source per project), and with `--check-links`
   it finds dead source links.
4. Every change is logged in `data/changelog.json` and shown on the site.

## Data

- `data/projects.json`: one record per project. The format is described in
  [`CLAUDE.md`](CLAUDE.md#project-record).
- `data/changelog.json`: every change, newest first.

Planned power is the full-build figure announced by the developer. Some sources
give total facility power and others IT load; each record says which. Locations
are approximate unless the exact site is public.

## Run it locally

Requires [Node.js](https://nodejs.org) 18 or later. There are no dependencies to install.

```bash
node scripts/serve.mjs
```

Then open http://localhost:8080. To check the data:

```bash
node scripts/validate.mjs
```

## Built with

Plain HTML, CSS and JavaScript (no build step), [Leaflet](https://leafletjs.com)
with OpenStreetMap/CARTO map tiles, GitHub Pages for hosting, and
[Claude Code](https://claude.com/claude-code) for research and data updates.
Running costs: $0.
