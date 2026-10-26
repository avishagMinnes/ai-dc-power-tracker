"use strict";

// Optional links for the footer and the Corrections paragraph. Fill these in after publishing.
const SITE = {
  author: "Avishag",
  authorUrl: null, // e.g. "https://www.linkedin.com/in/your-profile"
  repoUrl: "https://github.com/avishagMinnes/ai-dc-power-tracker",
};

const STATUS = {
  announced: { label: "Announced", group: "announced", order: 3 },
  under_construction: { label: "Under construction", group: "construction", order: 2 },
  partially_operational: { label: "Partly operating", group: "operating", order: 1 },
  operational: { label: "Operating", group: "operating", order: 0 },
  paused: { label: "Paused", group: "stopped", order: 4 },
  cancelled: { label: "Cancelled", group: "stopped", order: 5 },
};

// Colour encodes status everywhere on the page (map, charts, table badges).
const GROUPS = [
  { key: "operating", label: "Operating", color: "--st-operating" },
  { key: "construction", label: "Under construction", color: "--st-construction" },
  { key: "announced", label: "Announced", color: "--st-announced" },
  { key: "stopped", label: "Paused or cancelled", color: "--st-stopped" },
];

const POWER = {
  grid: "Grid",
  natural_gas: "Natural gas",
  nuclear: "Nuclear",
  solar: "Solar",
  wind: "Wind",
  hydro: "Hydro",
  geothermal: "Geothermal",
  battery_storage: "Battery storage",
  fuel_cell: "Fuel cells",
  other: "Other",
};

const REGIONS = {
  "north-america": [[14, -128], [56, -60]],
  europe: [[35, -12], [70, 32]],
  "middle-east": [[12, 30], [38, 62]],
  "asia-pacific": [[-42, 68], [45, 152]],
};

const CHANGE_TYPES = { added: "Added", updated: "Updated", status_change: "Status", removed: "Removed" };

const state = {
  projects: [],
  changes: [],
  filters: { q: "", status: "", power: "", country: "", onsite: false },
  sort: { key: "capacity_mw", dir: -1 },
  open: new Set(),
  showAllChanges: false,
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const groupOf = (p) => STATUS[p.status]?.group ?? "announced";
const groupInfo = (key) => GROUPS.find((g) => g.key === key);
const sumMW = (list) => list.reduce((t, p) => t + (p.capacity_mw ?? 0), 0);
const safeUrl = (u) => (/^https?:\/\//i.test(u ?? "") ? u : "#");

function fmtPower(mw) {
  if (mw == null) return "Not disclosed";
  if (mw >= 1000) return `${(mw / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} GW`;
  return `${Math.round(mw).toLocaleString("en-US")} MW`;
}
const fmtGW = (mw) => (mw / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });

function fmtDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!m) return String(y);
  const opts = { month: "short", year: "numeric", timeZone: "UTC" };
  if (d) opts.day = "numeric";
  return new Date(Date.UTC(y, m - 1, d || 1)).toLocaleDateString("en-GB", opts);
}

const place = (p) => [p.city, p.region, p.country].filter(Boolean).join(", ");

function badge(p) {
  const g = groupInfo(groupOf(p));
  return `<span class="badge"><i style="background:var(${g.color})"></i>${esc(STATUS[p.status]?.label ?? p.status)}</span>`;
}

/* ---------- Filtering ---------- */

function filtered() {
  const { q, status, power, country, onsite } = state.filters;
  const needle = q.trim().toLowerCase();
  return state.projects.filter((p) => {
    if (status && groupOf(p) !== status) return false;
    if (power && !p.power_sources.includes(power)) return false;
    if (country && p.country !== country) return false;
    if (onsite && p.onsite_generation !== true) return false;
    if (needle) {
      const hay = [p.name, p.developer, ...p.tenants, p.city, p.region, p.country, p.utility].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

const filtersActive = () => Object.values(state.filters).some(Boolean);

function setupFilters() {
  const groups = GROUPS.filter((g) => state.projects.some((p) => groupOf(p) === g.key));
  $("#f-status").insertAdjacentHTML("beforeend", groups.map((g) => `<option value="${g.key}">${esc(g.label)}</option>`).join(""));

  const sources = Object.keys(POWER).filter((k) => state.projects.some((p) => p.power_sources.includes(k)));
  $("#f-power").insertAdjacentHTML("beforeend", sources.map((k) => `<option value="${k}">${esc(POWER[k])}</option>`).join(""));

  const countries = [...new Set(state.projects.map((p) => p.country))].sort();
  $("#f-country").insertAdjacentHTML("beforeend", countries.map((c) => `<option>${esc(c)}</option>`).join(""));

  const bind = (id, key, prop = "value", evt = "input") =>
    $(id).addEventListener(evt, (e) => {
      state.filters[key] = e.target[prop];
      render({ fit: true });
    });
  bind("#f-q", "q");
  bind("#f-status", "status", "value", "change");
  bind("#f-power", "power", "value", "change");
  bind("#f-country", "country", "value", "change");
  bind("#f-onsite", "onsite", "checked", "change");

  $("#reset").addEventListener("click", () => {
    state.filters = { q: "", status: "", power: "", country: "", onsite: false };
    $("#f-q").value = "";
    $("#f-status").value = $("#f-power").value = $("#f-country").value = "";
    $("#f-onsite").checked = false;
    render({ fit: true });
  });
}

/* ---------- Summary tiles ---------- */

function renderStats(list) {
  const total = sumMW(list);
  const undisclosed = list.filter((p) => p.capacity_mw == null).length;
  const active = sumMW(list.filter((p) => ["operating", "construction"].includes(groupOf(p))));
  const onsite = list.filter((p) => p.onsite_generation === true);
  const countries = new Set(list.map((p) => p.country)).size;
  const pct = total ? Math.round((active / total) * 100) : 0;

  const tile = (label, value, unit, sub) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ""}</div><div class="stat-sub">${sub}</div></div>`;

  $("#stats").innerHTML = [
    tile("Projects", list.length, "", `in ${countries} ${countries === 1 ? "country" : "countries"}`),
    tile("Planned power", fmtGW(total), "GW", undisclosed ? `${undisclosed} with no published figure` : "all with published figures"),
    tile("Under construction or operating", fmtGW(active), "GW", `${pct}% of planned power`),
    tile("Own power on site", onsite.length, onsite.length === 1 ? "project" : "projects", `${fmtGW(sumMW(onsite))} GW planned`),
  ].join("");
}

/* ---------- Map ---------- */

let map, markerLayer;
const markers = new Map();
const baseLayers = [];
const renderer = L.canvas({ padding: 0.5, tolerance: 6 });

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
}

// The basemap is drawn from Natural Earth outlines (public domain), so it needs no
// tile service or API key and follows the page's colour tokens in both themes.
const BASEMAP = {
  countries: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
  states: "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json",
};

function baseStyles() {
  return {
    land: { fillColor: cssVar("--land"), fillOpacity: 1, color: cssVar("--land-line"), weight: 0.8 },
    states: { color: cssVar("--state-line"), weight: 0.7, fill: false },
  };
}

function styleBasemap() {
  const s = baseStyles();
  for (const { layer, kind } of baseLayers) layer.setStyle(s[kind]);
}

// Countries that cross the 180° meridian (Russia, Fiji) jump from +180 to -180, which
// Leaflet draws as a line across the map. Unwrap each ring so it stays continuous.
function unwrapRings(geo) {
  const fixRing = (ring) => {
    for (let i = 1; i < ring.length; i++) {
      while (ring[i][0] - ring[i - 1][0] > 180) ring[i][0] -= 360;
      while (ring[i][0] - ring[i - 1][0] < -180) ring[i][0] += 360;
    }
  };
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    polys.forEach((poly) => poly.forEach(fixRing));
  }
  return geo;
}

async function loadBasemap() {
  // A pane below the markers, so the outlines never cover them whatever loads first.
  map.createPane("basemap").style.zIndex = 250;
  const opts = { pane: "basemap", renderer: L.svg({ pane: "basemap", padding: 0.5 }), interactive: false };
  const [world, us] = await Promise.all(Object.values(BASEMAP).map((u) => fetch(u).then((r) => r.json())));
  const s = baseStyles();
  const countries = topojson.feature(world, world.objects.countries);
  countries.features = countries.features.filter((f) => f.properties?.name !== "Antarctica");
  const land = L.geoJSON(unwrapRings(countries), { ...opts, style: s.land });
  const states = L.geoJSON(topojson.mesh(us, us.objects.states, (a, b) => a !== b), { ...opts, style: s.states });
  for (const [layer, kind] of [[land, "land"], [states, "states"]]) {
    layer.addTo(map);
    baseLayers.push({ layer, kind });
  }
}

function initMap() {
  map = L.map("map", {
    scrollWheelZoom: false,
    minZoom: 0.5,
    maxZoom: 9,
    zoomSnap: 0.25,
    maxBounds: [[-70, -200], [85, 200]],
    renderer,
  }).setView([30, 0], 2);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
  loadBasemap().catch((e) => console.error("Basemap failed to load", e));
  // Only capture the scroll wheel once the reader has clicked into the map.
  map.on("click focus", () => map.scrollWheelZoom.enable());
  map.on("mouseout blur", () => map.scrollWheelZoom.disable());
  map.on("popupclose", () => {
    if (location.hash.startsWith("#p/")) history.replaceState(null, "", location.pathname + location.search);
  });
  markerLayer = L.layerGroup().addTo(map);

  $$(".chips button").forEach((b) =>
    b.addEventListener("click", () => {
      const r = b.dataset.region;
      setRegionChip(r);
      if (r === "world") fitTo(filtered());
      else map.fitBounds(REGIONS[r]);
    })
  );
}

const radius = (mw) => (mw == null ? 5 : Math.max(4, Math.sqrt(mw) * 0.32));

function setRegionChip(region) {
  $$(".chips button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.region === region)));
}

// Fits the map to the projects and returns the region now shown. On a phone the whole
// world is too small to read, so with preferDense it starts on North America when most
// of the projects are there; the World button still shows everything.
function fitTo(list, { preferDense = false } = {}) {
  if (!list.length) return "world";
  const opts = { padding: [36, 36], maxZoom: 6 };
  if (preferDense && map.getSize().x < 600) {
    const box = L.latLngBounds(REGIONS["north-america"]);
    const inside = list.filter((p) => box.contains([p.lat, p.lng]));
    if (inside.length > list.length / 2 && inside.length < list.length) {
      map.fitBounds(L.latLngBounds(inside.map((p) => [p.lat, p.lng])), opts);
      return "north-america";
    }
  }
  map.fitBounds(L.latLngBounds(list.map((p) => [p.lat, p.lng])), opts);
  return "world";
}

function renderMap(list, fit) {
  markerLayer.clearLayers();
  markers.clear();
  const ring = cssVar("--surface");
  [...list]
    .sort((a, b) => (b.capacity_mw ?? 0) - (a.capacity_mw ?? 0))
    .forEach((p) => {
      const color = cssVar(groupInfo(groupOf(p)).color);
      const unknown = p.capacity_mw == null;
      const m = L.circleMarker([p.lat, p.lng], {
        renderer,
        radius: radius(p.capacity_mw),
        color: unknown ? color : ring,
        weight: unknown ? 2 : 1.5,
        fillColor: color,
        fillOpacity: unknown ? 0.12 : 0.8,
      });
      m.bindTooltip(`<strong>${esc(p.name)}</strong><br>${esc(fmtPower(p.capacity_mw))} · ${esc(STATUS[p.status].label)}`, {
        direction: "top",
        offset: [0, -radius(p.capacity_mw)],
      });
      m.bindPopup(() => detailHtml(p, { popup: true }), { maxWidth: 340, autoPanPadding: [24, 24] });
      m.on("popupopen", () => history.replaceState(null, "", `#p/${p.id}`));
      m.addTo(markerLayer);
      markers.set(p.id, m);
    });
  if (fit) setRegionChip(fitTo(list, { preferDense: true }));
}

function renderSizeKey() {
  const sizes = [100, 1000, 5000];
  const max = radius(5000);
  $("#size-key").innerHTML = sizes
    .map((mw) => {
      const r = radius(mw);
      return `<span><svg width="${r * 2 + 2}" height="${max * 2 + 2}" aria-hidden="true"><circle cx="${r + 1}" cy="${max * 2 + 1 - r}" r="${r}"/></svg>${fmtPower(mw)}</span>`;
    })
    .join("");
}

function showOnMap(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) return;
  if (!markers.has(id)) {
    // The project is hidden by a filter: clear filters so its marker exists.
    $("#reset").click();
  }
  $("#map-section").scrollIntoView({ block: "start" });
  map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 6), { duration: 0.8 });
  map.once("moveend", () => markers.get(id)?.openPopup());
}

/* ---------- Project detail (popup and table) ---------- */

function detailHtml(p, { popup = false } = {}) {
  const basis = { it: " (IT load)", facility: " (total facility power)", unspecified: "" }[p.capacity_basis] ?? "";
  const approx = p.location_precision !== "site" ? ` <span class="src-meta">(approximate)</span>` : "";
  const rows = [
    ["Developer", esc(p.developer)],
    ["Tenants", esc(p.tenants.join(", "))],
    ["Location", esc(place(p)) + approx],
    ["Planned power", p.capacity_mw == null ? "Not disclosed" : esc(fmtPower(p.capacity_mw) + basis)],
    ["Power sources", esc(p.power_sources.map((s) => POWER[s]).join(", ") || "Not disclosed")],
    ["Own power on site", p.onsite_generation === true ? "Yes" : p.onsite_generation === false ? "No" : "Not stated in sources"],
    ["Utility", esc(p.utility)],
    ["Announced", esc(fmtDate(p.announced))],
    ["Expected online", esc(p.expected_online)],
    ["Investment", p.investment_usd_bn != null ? `$${esc(p.investment_usd_bn)} billion` : ""],
  ].filter(([, v]) => v);

  const dl = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const notes = [p.power_notes, p.notes].filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join("");
  const sources = `<strong>Sources</strong><ol class="sources">${p.sources
    .map(
      (s) =>
        `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="src-meta">${esc(
          [s.publisher, fmtDate(s.date)].filter(Boolean).join(", ")
        )}</span></li>`
    )
    .join("")}</ol>`;
  const checked = `<div class="checked">Last checked ${esc(fmtDate(p.last_verified))}</div>`;

  if (popup) {
    return `<div class="detail"><h3>${esc(p.name)}</h3>${badge(p)}${dl}${notes}${sources}${checked}</div>`;
  }
  return `<div class="detail detail-grid"><div>${dl}${notes}</div><div>${sources}${checked}
    <div class="actions"><button type="button" class="link-btn" data-map="${esc(p.id)}">Show on map</button>
    <button type="button" class="link-btn" data-copy="${esc(p.id)}">Copy link</button></div></div></div>`;
}

/* ---------- Charts ---------- */

function stack(list, keysOf) {
  const rows = new Map();
  for (const p of list) {
    if (p.capacity_mw == null) continue;
    for (const k of keysOf(p)) {
      const r = rows.get(k) ?? { key: k, total: 0, count: 0, by: {} };
      r.total += p.capacity_mw;
      r.count += 1;
      const g = groupOf(p);
      r.by[g] = (r.by[g] ?? 0) + p.capacity_mw;
      rows.set(k, r);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

function renderBars(el, rows, labelOf) {
  if (!rows.length) {
    el.innerHTML = `<p class="empty">No projects with a published power figure match the filters.</p>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.total));
  el.innerHTML = rows
    .map((r) => {
      const label = labelOf(r.key);
      const segs = GROUPS.filter((g) => r.by[g.key] > 0)
        .map((g) => {
          const tip = `<strong>${esc(label)}: ${esc(g.label)}</strong>${fmtGW(r.by[g.key])} GW`;
          return `<span class="seg" tabindex="0" style="flex:${r.by[g.key]};background:var(${g.color})" data-tip="${esc(tip)}" aria-label="${esc(
            `${label}, ${g.label}: ${fmtGW(r.by[g.key])} GW`
          )}"></span>`;
        })
        .join("");
      const tip = `<strong>${esc(label)}</strong>${fmtGW(r.total)} GW across ${r.count} ${r.count === 1 ? "project" : "projects"}`;
      return `<div class="bar-row">
        <span class="bar-label" title="${esc(label)}">${esc(label)}</span>
        <span class="bar-track"><span class="bar" style="width:${(r.total / max) * 100}%">${segs}</span></span>
        <span class="bar-value" data-tip="${esc(tip)}">${fmtGW(r.total)} GW</span>
      </div>`;
    })
    .join("");
}

function renderCharts(list) {
  const power = stack(list, (p) => (p.power_sources.length ? p.power_sources : ["_none"]));
  renderBars($("#chart-power"), power, (k) => (k === "_none" ? "Not disclosed" : POWER[k]));

  let countries = stack(list, (p) => [p.country]);
  if (countries.length > 8) {
    const rest = countries.slice(7);
    const other = { key: "_other", total: 0, count: 0, by: {} };
    for (const r of rest) {
      other.total += r.total;
      other.count += r.count;
      for (const [g, v] of Object.entries(r.by)) other.by[g] = (other.by[g] ?? 0) + v;
    }
    countries = [...countries.slice(0, 7), other];
  }
  renderBars($("#chart-country"), countries, (k) => (k === "_other" ? "Other countries" : k));
}

function setupTooltip() {
  const tip = $("#tip");
  const show = (el) => {
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
    const top = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => (tip.hidden = true);
  for (const evt of ["mouseover", "focusin"]) {
    document.addEventListener(evt, (e) => {
      const el = e.target.closest?.("[data-tip]");
      if (el) show(el);
    });
  }
  for (const evt of ["mouseout", "focusout"]) {
    document.addEventListener(evt, (e) => {
      if (e.target.closest?.("[data-tip]")) hide();
    });
  }
  addEventListener("scroll", hide, { passive: true });
}

/* ---------- Table ---------- */

const COLUMNS = [
  { key: "name", label: "Project", value: (p) => p.name.toLowerCase() },
  { key: "location", label: "Location", value: (p) => `${p.country} ${p.region ?? ""} ${p.city ?? ""}`.toLowerCase() },
  { key: "capacity_mw", label: "Planned power", value: (p) => p.capacity_mw ?? -1, num: true },
  { key: "power", label: "Power sources", value: (p) => p.power_sources.map((s) => POWER[s]).join(", ") || "~", cls: "hide-sm" },
  { key: "status", label: "Status", value: (p) => STATUS[p.status]?.order ?? 9 },
  { key: "online", label: "Online", value: (p) => p.expected_online ?? "~", cls: "hide-sm" },
];

function renderTableHead() {
  $("#table thead").innerHTML = `<tr>${COLUMNS.map((c) => {
    const active = state.sort.key === c.key;
    const sortAttr = active ? ` aria-sort="${state.sort.dir > 0 ? "ascending" : "descending"}"` : "";
    const arrow = active ? (state.sort.dir > 0 ? "↑" : "↓") : "";
    return `<th class="${[c.num ? "num" : "", c.cls ?? ""].join(" ")}"${sortAttr}><button type="button" data-sort="${c.key}">${c.label}<span class="arrow" aria-hidden="true">${arrow}</span></button></th>`;
  }).join("")}</tr>`;
}

function renderTable(list) {
  const col = COLUMNS.find((c) => c.key === state.sort.key);
  const rows = [...list].sort((a, b) => {
    const x = col.value(a);
    const y = col.value(b);
    return (x < y ? -1 : x > y ? 1 : 0) * state.sort.dir || a.name.localeCompare(b.name);
  });

  $("#table tbody").innerHTML =
    rows
      .map((p) => {
        const open = state.open.has(p.id);
        const main = `<tr class="row${open ? " open" : ""}" data-id="${esc(p.id)}" tabindex="0" aria-expanded="${open}">
        <td><span class="toggle" aria-hidden="true">›</span> <span class="cell-name">${esc(p.name)}</span><div class="cell-sub">${esc(
          [p.developer, ...p.tenants.filter((t) => t !== p.developer)].join(" · ")
        )}</div></td>
        <td>${esc([p.city, p.region].filter(Boolean).join(", "))}<div class="cell-sub">${esc(p.country)}</div></td>
        <td class="num">${esc(fmtPower(p.capacity_mw))}</td>
        <td class="hide-sm">${esc(p.power_sources.map((s) => POWER[s]).join(", ") || "Not disclosed")}</td>
        <td>${badge(p)}</td>
        <td class="hide-sm">${esc(p.expected_online ?? "")}</td>
      </tr>`;
        const detail = open ? `<tr class="detail-row"><td colspan="${COLUMNS.length}">${detailHtml(p)}</td></tr>` : "";
        return main + detail;
      })
      .join("") || `<tr><td colspan="${COLUMNS.length}" class="empty">No projects match the filters.</td></tr>`;
}

function setupTable() {
  $("#table thead").addEventListener("click", (e) => {
    const key = e.target.closest("[data-sort]")?.dataset.sort;
    if (!key) return;
    state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: key === "capacity_mw" ? -1 : 1 };
    renderTableHead();
    renderTable(filtered());
  });

  const toggle = (row) => {
    const id = row.dataset.id;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    renderTable(filtered());
    $(`#table tr.row[data-id="${CSS.escape(id)}"]`)?.focus();
  };
  $("#table tbody").addEventListener("click", (e) => {
    const mapBtn = e.target.closest("[data-map]");
    if (mapBtn) return showOnMap(mapBtn.dataset.map);
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) {
      const url = `${location.origin}${location.pathname}#p/${copyBtn.dataset.copy}`;
      navigator.clipboard?.writeText(url).then(() => (copyBtn.textContent = "Link copied"));
      return;
    }
    if (e.target.closest("a, .detail-row")) return;
    const row = e.target.closest("tr.row");
    if (row) toggle(row);
  });
  $("#table tbody").addEventListener("keydown", (e) => {
    const row = e.target.closest("tr.row");
    if (row && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggle(row);
    }
  });
}

/* ---------- CSV download ---------- */

function downloadCsv() {
  const cols = [
    "id", "name", "developer", "tenants", "city", "region", "country", "lat", "lng", "capacity_mw", "capacity_basis",
    "power_sources", "onsite_generation", "utility", "status", "announced", "expected_online", "investment_usd_bn",
    "last_verified", "source_urls",
  ];
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = filtered().map((p) =>
    cols.map((c) => cell(c === "source_urls" ? p.sources.map((s) => s.url) : p[c])).join(",")
  );
  const blob = new Blob([[cols.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "ai-data-center-power-tracker.csv",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Changelog ---------- */

function renderChanges() {
  const names = new Map(state.projects.map((p) => [p.id, p.name]));
  const list = state.showAllChanges ? state.changes : state.changes.slice(0, 10);
  $("#changelog").innerHTML =
    list
      .map((c) => {
        const name = names.get(c.project_id);
        const link = name ? `<a href="#p/${esc(c.project_id)}">${esc(name)}</a>: ` : "";
        const src = c.source_url ? ` <a href="${esc(safeUrl(c.source_url))}" target="_blank" rel="noopener noreferrer">Source</a>` : "";
        return `<li><time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time><div><span class="change-type">${esc(
          CHANGE_TYPES[c.type] ?? c.type
        )}</span>${link}${esc(c.summary)}${src}</div></li>`;
      })
      .join("") || `<li><span></span><span class="empty">No changes logged yet.</span></li>`;
  const more = $("#changes-more");
  more.hidden = state.showAllChanges || state.changes.length <= 10;
  more.textContent = `Show all ${state.changes.length} changes`;
}

/* ---------- Page ---------- */

function render({ fit = false } = {}) {
  const list = filtered();
  renderStats(list);
  renderMap(list, fit);
  renderCharts(list);
  renderTable(list);
  $("#count").textContent =
    list.length === state.projects.length ? `${list.length} projects` : `Showing ${list.length} of ${state.projects.length} projects`;
  $("#reset").hidden = !filtersActive();
}

function renderMeta() {
  const dates = [...state.projects.map((p) => p.last_verified), ...state.changes.map((c) => c.date)].filter(Boolean).sort();
  const latest = dates.at(-1);
  $("#updated").textContent = latest ? `Data last checked ${fmtDate(latest)}.` : "";

  if (SITE.repoUrl) {
    $("#corrections").innerHTML = `Spotted an error or a missing project? <a href="${esc(SITE.repoUrl)}/issues/new">Open an issue on GitHub</a> with a link to a source. The code and data are <a href="${esc(SITE.repoUrl)}">open source</a>.`;
  }
  if (SITE.author) {
    const who = SITE.authorUrl ? `<a href="${esc(SITE.authorUrl)}">${esc(SITE.author)}</a>` : esc(SITE.author);
    $("#footer").insertAdjacentHTML("afterbegin", `<span>Built by ${who}.</span>`);
  }
}

function renderLegends() {
  const used = GROUPS.filter((g) => state.projects.some((p) => groupOf(p) === g.key));
  const html = used.map((g) => `<span class="key"><i style="background:var(${g.color})"></i>${esc(g.label)}</span>`).join("");
  $$("[data-legend]").forEach((el) => (el.innerHTML = html));
}

function openFromHash() {
  const m = location.hash.match(/^#p\/(.+)$/);
  if (m) showOnMap(decodeURIComponent(m[1]));
}

function setupTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.dataset.theme = saved;
  } catch {}
  const repaint = () => {
    styleBasemap();
    renderMap(filtered(), false);
  };
  $("#theme-toggle").addEventListener("click", () => {
    root.dataset.theme = isDark() ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {}
    repaint();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!root.dataset.theme) repaint();
  });
}

async function main() {
  try {
    const [projects, changes] = await Promise.all(
      ["data/projects.json", "data/changelog.json"].map((u) =>
        fetch(u, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(`${u}: ${r.status}`);
          return r.json();
        })
      )
    );
    state.projects = projects;
    state.changes = changes;
  } catch (e) {
    $("#updated").textContent = "The data could not be loaded. Please try again later.";
    console.error(e);
    return;
  }

  setupTheme();
  initMap();
  setupFilters();
  setupTable();
  setupTooltip();
  renderTableHead();
  renderLegends();
  renderSizeKey();
  renderMeta();
  renderChanges();
  render({ fit: true });

  $("#download-csv").addEventListener("click", downloadCsv);
  $("#changes-more").addEventListener("click", () => {
    state.showAllChanges = true;
    renderChanges();
  });
  addEventListener("hashchange", openFromHash);
  openFromHash();
}

main();
