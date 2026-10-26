// Checks data/projects.json and data/changelog.json against the rules in CLAUDE.md.
// Usage: node scripts/validate.mjs [--check-links]
// Exits with code 1 if there are errors. Warnings are printed but do not fail.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkLinks = process.argv.includes("--check-links");

const STATUSES = ["announced", "under_construction", "partially_operational", "operational", "paused", "cancelled"];
const POWER = ["grid", "natural_gas", "nuclear", "solar", "wind", "hydro", "geothermal", "battery_storage", "fuel_cell", "other"];
const PRECISION = ["site", "city", "county", "region"];
const BASIS = ["facility", "it", "unspecified"];
const CHANGE_TYPES = ["added", "updated", "status_change", "removed"];
const FIELDS = [
  "id", "name", "developer", "tenants", "city", "region", "country", "lat", "lng",
  "location_precision", "capacity_mw", "capacity_basis", "power_sources", "onsite_generation",
  "utility", "power_notes", "status", "announced", "expected_online", "investment_usd_bn",
  "sources", "last_verified", "notes",
];

const errors = [];
const warnings = [];
const today = new Date().toISOString().slice(0, 10);

function load(file) {
  try {
    return JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (e) {
    errors.push(`${file}: cannot parse (${e.message})`);
    return null;
  }
}

const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isNullOr = (v, test) => v === null || test(v);
const isDay = (v) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v);
const isUrl = (v) => /^https?:\/\/\S+$/.test(v);

const projects = load("data/projects.json");
const changelog = load("data/changelog.json");

if (projects && !Array.isArray(projects)) errors.push("data/projects.json must be an array");

const ids = new Set();
for (const [i, p] of (Array.isArray(projects) ? projects : []).entries()) {
  const at = `project ${p?.id ?? `#${i}`}`;
  const err = (msg) => errors.push(`${at}: ${msg}`);
  const warn = (msg) => warnings.push(`${at}: ${msg}`);

  for (const f of FIELDS) if (!(f in p)) err(`missing field "${f}"`);
  for (const f of Object.keys(p)) if (!FIELDS.includes(f)) warn(`unknown field "${f}"`);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id ?? "")) err("id must be kebab-case");
  if (ids.has(p.id)) err("duplicate id");
  ids.add(p.id);

  for (const f of ["name", "developer", "country"]) if (!isStr(p[f])) err(`"${f}" must be a non-empty string`);
  for (const f of ["city", "region", "utility", "power_notes", "expected_online", "notes"]) {
    if (!isNullOr(p[f], isStr)) err(`"${f}" must be a string or null`);
  }
  if (!Array.isArray(p.tenants) || !p.tenants.every(isStr)) err('"tenants" must be a list of names');

  if (typeof p.lat !== "number" || p.lat < -90 || p.lat > 90) err('"lat" must be a number between -90 and 90');
  if (typeof p.lng !== "number" || p.lng < -180 || p.lng > 180) err('"lng" must be a number between -180 and 180');
  if (p.country === "United States" && (p.lng > -60 || p.lat < 18)) err("coordinates are outside the United States");
  if (!PRECISION.includes(p.location_precision)) err(`"location_precision" must be one of ${PRECISION.join(", ")}`);

  if (!isNullOr(p.capacity_mw, (v) => typeof v === "number" && v > 0)) err('"capacity_mw" must be a positive number or null');
  else if (p.capacity_mw !== null && p.capacity_mw < 100) warn(`capacity ${p.capacity_mw} MW is below the 100 MW threshold`);
  if (!BASIS.includes(p.capacity_basis)) err(`"capacity_basis" must be one of ${BASIS.join(", ")}`);

  if (!Array.isArray(p.power_sources) || !p.power_sources.every((s) => POWER.includes(s))) {
    err(`"power_sources" may only contain ${POWER.join(", ")}`);
  } else if (new Set(p.power_sources).size !== p.power_sources.length) err('"power_sources" has duplicates');
  if (![true, false, null].includes(p.onsite_generation)) err('"onsite_generation" must be true, false or null');

  if (!STATUSES.includes(p.status)) err(`"status" must be one of ${STATUSES.join(", ")}`);
  if (!isNullOr(p.announced, (v) => /^\d{4}(-\d{2})?$/.test(v))) err('"announced" must be YYYY or YYYY-MM or null');
  if (!isNullOr(p.investment_usd_bn, (v) => typeof v === "number" && v > 0)) err('"investment_usd_bn" must be a positive number or null');

  if (!Array.isArray(p.sources) || p.sources.length === 0) err("needs at least one source");
  else {
    for (const s of p.sources) {
      if (!isStr(s.title) || !isStr(s.publisher)) err(`source ${s.url ?? "?"} needs a title and publisher`);
      if (!isUrl(s.url ?? "")) err(`source URL is not valid: ${s.url}`);
      if (!isNullOr(s.date, isDay)) err(`source date must be YYYY-MM-DD, YYYY-MM, YYYY or null: ${s.date}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.last_verified ?? "")) err('"last_verified" must be YYYY-MM-DD');
  else if (p.last_verified > today) err('"last_verified" is in the future');
}

if (changelog && !Array.isArray(changelog)) errors.push("data/changelog.json must be an array");
let previous = "9999-12-31";
for (const [i, c] of (Array.isArray(changelog) ? changelog : []).entries()) {
  const at = `changelog #${i + 1}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date ?? "")) errors.push(`${at}: "date" must be YYYY-MM-DD`);
  else if (c.date > previous) errors.push(`${at}: entries must be newest first`);
  else previous = c.date;
  if (!CHANGE_TYPES.includes(c.type)) errors.push(`${at}: "type" must be one of ${CHANGE_TYPES.join(", ")}`);
  if (c.project_id !== null && c.type !== "removed" && !ids.has(c.project_id)) {
    errors.push(`${at}: unknown project_id "${c.project_id}"`);
  }
  if (!isStr(c.summary)) errors.push(`${at}: needs a summary`);
  if (!isNullOr(c.source_url, isUrl)) errors.push(`${at}: "source_url" must be a URL or null`);
}

if (checkLinks && Array.isArray(projects)) {
  const urls = [...new Set(projects.flatMap((p) => (p.sources ?? []).map((s) => s.url)))];
  console.log(`Checking ${urls.length} source links...`);
  await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: { "user-agent": "Mozilla/5.0 (link check for ai-dc-power-tracker)" },
      });
      // Many news sites refuse automated requests (401/403/429); only a 404 or 410 means the page is gone.
      if (res.status === 404 || res.status === 410) errors.push(`dead link (${res.status}): ${url}`);
      else if (!res.ok) warnings.push(`link returned ${res.status} (may block bots): ${url}`);
    } catch (e) {
      warnings.push(`link could not be reached (${e.name}): ${url}`);
    }
  }));
}

for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`ERROR    ${e}`);
const count = Array.isArray(projects) ? projects.length : 0;
console.log(`\n${count} projects, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
