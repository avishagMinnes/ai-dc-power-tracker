---
name: update-tracker
description: Weekly data update for the AI Data Center Power Tracker. Finds new or changed AI data center projects in the news, verifies them against sources, updates data/projects.json and data/changelog.json, runs the validator and drafts a short digest. Use when asked to update, refresh or check the tracker data, or when run on a schedule. Pass "publish" to commit and push the result.
---

# Update the tracker

The data rules in `CLAUDE.md` are binding for every step. If a fact cannot be
confirmed in a page you opened during this run, leave it out.

## 1. Get oriented

- Today's date is the date of this run. Read `data/projects.json` and `data/changelog.json`.
- The last update is the newest `date` in the changelog. Look for news since then
  (at least the last 14 days).
- Load the web tools if needed: ToolSearch with `select:WebSearch,WebFetch`.

## 2. Find new projects and changes

Run these searches (add the current month and year to each), several at a time:

- `AI data center gigawatt announced`
- `data center campus MW announced` and `hyperscale data center approved county`
- `Stargate new data center site`, `Meta data center new`, `Microsoft data center new`,
  `Google data center investment`, `AWS data center investment`, `xAI data center`
- `data center natural gas power plant`, `data center nuclear power agreement`,
  `data center behind-the-meter`, `data center battery storage`
- `data center project cancelled`, `data center paused`, `data center delayed`,
  `data center begins construction`, `data center comes online`
- Outside the US: `AI data center gigawatt Europe`, `... India`, `... Saudi Arabia`,
  `... UAE`, `... Japan`, `... Malaysia`, `... Brazil`

For each lead, decide whether it qualifies (rule 4 in `CLAUDE.md`) and whether it
is already in the dataset (match on location and developer, not just name).
Cap a run at about 10 new projects; note any extra leads in the summary instead.

## 3. Re-check existing projects

Pick up to 10 projects with status `announced`, `under_construction` or
`partially_operational`, oldest `last_verified` first. Search for news on each.
Update status, capacity, power sources or dates only when a new source supports it,
and add that source. Set `last_verified` to today for every project you re-checked,
even if nothing changed.

## 4. Edit the data

- New project: add a full record (see "Project record" in `CLAUDE.md`). Never reuse
  or change an existing `id`.
- Changed project: edit the fields and add the new source to `sources`.
- Cancelled project: set `status` to `cancelled` and keep the record. Remove a record
  only if it was a mistake (it never qualified), and log it as `removed`.
- Add one changelog entry per change at the top of `data/changelog.json`, newest first.
  Re-checks with no change are not logged.

## 5. Validate

Run `node scripts/validate.mjs` and fix every error. On the first run of each month,
run `node scripts/validate.mjs --check-links` too: replace dead links (404/410) with a
working source or an archived copy (web.archive.org).

## 6. Draft the digest

Write `digests/YYYY-MM-DD.md`: a short post the owner can share on LinkedIn. A title
line, then 3 to 5 bullets of the most notable changes, each with its source link,
then one line linking to the tracker. Facts only, no hype. If nothing changed, say
so in one line and skip the bullets.

## 7. Report and publish

Tell the user in a few lines: what was added, what changed, what you looked at but
left out and why, and the validator result.

If the run was started with the argument `publish`, and the validator passed:
`git add data digests`, commit with the message `Data update YYYY-MM-DD`, and
`git push`. Otherwise leave the changes uncommitted for the user to review.
