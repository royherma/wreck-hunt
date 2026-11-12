import { mountSearch, textOf } from "/search.js";
import { openSpot, closeSpot } from "/where.js";
import { $, reduce, fmt, f1, sc, VERDICT, params, fetchJson, loadHunt, loadHf, thumbFor, contourBackdrop, makeViewer, drawProfile } from "/lib.js";

const tipEl = $("#tip");
function tipHtml(item) {
  const rows = (item.score_parts || []).map((p) => `<div class="r ${p.value < p.max - 0.35 ? "low" : ""}"><b>${p.name}</b><i>${f1(p.value)} of ${p.max}</i><span>${p.why}</span></div>`).join("");
  return `<h4>Score <i>${sc(item.score)}</i> of ${item.score_max}</h4>${rows}<p><b>Pulled down:</b> ${item.pulled_down || "nothing"}</p>`;
}
function showTip(el, item, render = tipHtml) {
  tipEl.innerHTML = render(item);
  tipEl.hidden = false;
  const r = el.getBoundingClientRect();
  const th = tipEl.offsetHeight, tw = tipEl.offsetWidth;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8;
  if (y + th > innerHeight - 8) y = Math.max(8, innerHeight - th - 8);
  x = Math.min(Math.max(8, x), innerWidth - tw - 8);
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
function bindTip(el, getItem, render) {
  el.addEventListener("pointerenter", () => showTip(el, getItem(), render));
  el.addEventListener("pointerleave", () => (tipEl.hidden = true));
  el.addEventListener("focus", () => showTip(el, getItem(), render));
  el.addEventListener("blur", () => (tipEl.hidden = true));
}

const withAreaUrl = (u) => (window.WH_AREA && window.WH_AREA !== "chesapeake_mouth" ? u + (u.includes("?") ? "&" : "?") + "area=" + window.WH_AREA : u);

function renderFunnel(data) {
  const fs = data.funnel || [];
  const ol = $("#stages");
  const area = data.area || {};
  const bumps = fs.filter((s) => s.unit === "bumps" || s.unit === "leads");
  let worst = -1, worstKept = 2;
  fs.forEach((s, i) => {
    if (i > 1 && fs[i - 1].count) {
      const kept = s.count / fs[i - 1].count;
      if (kept < worstKept) { worstKept = kept; worst = i; }
    }
  });
  ol.innerHTML = "";
  fs.forEach((s, i) => {
    const li = document.createElement("li");
    if (i === worst) li.className = "cliff";
    let kept = "";
    if (i === 0 && area.seabed_km2) kept = `<i>${Math.round((s.count / area.seabed_km2) * 100)}%</i> of the ${fmt(area.seabed_km2)} km² seabed`;
    else if (i === 1 && fs[0].count) kept = `<i>${f1(s.count / fs[0].count)}</i> per km²`;
    else if (i > 1) {
      const pct = (s.count / fs[i - 1].count) * 100;
      kept = `<i>${pct < 10 ? f1(pct) : Math.round(pct)}%</i> kept${i === worst ? `, <i>${f1(100 - pct)}%</i> dropped here` : ""}`;
    }
    const go = [["map", "/map.html"], ["all", "/all.html"], ["un", "/all.html?group=uncharted"], ["all", "/all.html"], ["short", "#grid"]][i];
    if (go && S.mode === "real") { li.classList.add("go"); li.title = i === fs.length - 1 ? "Jump to the shortlist" : "Open these"; li.onclick = () => go[1].startsWith("#") ? $(go[1]).scrollIntoView({ behavior: reduce ? "auto" : "smooth" }) : (location.href = withAreaUrl(go[1])); }
    li.innerHTML = `<div><div class="big"><span class="cnt" data-count="${s.count}">${fmt(s.count)}</span><small>${s.unit === "km²" ? "km²" : ""}</small></div><div class="lab" title="${s.stage}">${s.stage}</div></div><div class="kept">${kept}</div>`;
    ol.append(li);
  });
  const svg = $("#steps");
  const n = fs.length || 1;
  const hts = fs.map((s, i) => (i === 0 ? 1 : Math.max(Math.log10(Math.max(s.count, 1)) / Math.log10(Math.max(...fs.slice(1).map((q) => q.count), 10)), 0.08)));
  const colors = ["#E3EFF5", "#D3E8F1", "#C2DDEA", "#A9CFE1", "#8DB9D0"];
  let out = "";
  hts.forEach((h, i) => {
    const y = h * 96;
    const x0 = (i / n) * 100, x1 = ((i + 1) / n) * 100;
    const hot = i === worst;
    out += `<rect x="${x0}" y="0" width="${100 / n + 0.05}" height="${y}" fill="${hot ? "rgba(163,25,127,.12)" : colors[Math.min(i, colors.length - 1)]}"/>`;
    out += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${hot ? "#A3197F" : "#1F4E6B"}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
    if (i > 0) out += `<line x1="${x0}" x2="${x0}" y1="${hts[i - 1] * 96}" y2="${y}" stroke="${hot ? "#A3197F" : "#1F4E6B"}" stroke-width="${hot ? 1.6 : 1}" vector-effect="non-scaling-stroke"/>`;
  });
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.innerHTML = out;
  if (!reduce) {
    ol.querySelectorAll(".cnt").forEach((el) => {
      const target = +el.dataset.count;
      const t0 = performance.now() + 350;
      el.textContent = fmt(0);
      const step = (now) => {
        const t = Math.min(Math.max((now - t0) / 1100, 0), 1);
        el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
}

function refBar(item, med) {
  const pct = (item.score / item.score_max) * 100;
  const tick = med == null ? "" : `<i class="tick" style="left:${(med / item.score_max) * 100}%"></i>`;
  const note = med == null ? "" : `<span class="refnote">Charted median <i>${sc(med)}</i></span>`;
  return `<span class="sbar"><b style="width:${pct}%"></b>${tick}</span>${note}`;
}

const cap1 = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function factsHtml(item) {
  const row = (label, value, unit, cls = "") => `<div class="${cls}"><dd>${value}<small>${unit}</small></dd><dt>${label}</dt></div>`;
  const rows = [
    row("Length by width", `${f1(item.length_m)}<small> by </small>${f1(item.width_m)}`, " m"),
    row("Height off the seabed", f1(item.height_m), " m"),
    row("Water depth", f1(item.depth_m), " m", "deep"),
  ];
  if (item.verdict === "charted") { if (item.survey_year) rows.push(row("Surveyed", item.survey_year, "")); }
  else if (item.nearest_charted_km != null) rows.push(row("Nearest charted wreck", f1(item.nearest_charted_km), " km"));
  return rows.join("");
}

function identityBits(k) {
  const v = k.vessel;
  const when = v ? (v.sunk ? `sunk ${v.sunk}` : v.reported ? `first reported ${v.reported}` : null) : null;
  const kind = [cap1(k.chart_category), k.charted_year ? `charted ${k.charted_year}` : null, when].filter(Boolean).join(", ");
  return { name: v?.name || (S.data.area?.source && S.data.area.source !== "NOAA" ? "Unnamed wreck" : "Unnamed on NOAA charts"), kind, note: k.chart_note, story: v?.story };
}

function knownTip(k) {
  const b = identityBits(k);
  const r = (l, v) => (v ? `<div class="r"><b>${l}</b><i></i><span>${v}</span></div>` : "");
  return `<h4>${b.name}</h4>${r("On the chart as", b.kind || "no category given")}${r("Chart note", b.note)}${r("NOAA notes", b.story && b.story.length > 150 ? b.story.slice(0, 150) + "..." : b.story)}<p>${f1(k.length_m)} m long, ${f1(k.depth_m)} m deep. Click to open it in 3D</p>`;
}

function renderProgress(p) {
  const el = $("#progress");
  if (!p || !p.steps) { el.hidden = true; return; }
  el.hidden = false;
  const stamp = p.updated_at ? new Date(p.updated_at).toLocaleTimeString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", minute: "2-digit" }) : "";
  if (p.state === "done") {
    el.className = "done";
    el.innerHTML = `<span class="pdone">Hunt finished${stamp ? ` ${stamp} Bangkok` : ""}</span>`;
    return;
  }
  el.className = "";
  const run = p.steps.find((s) => s.state === "running") || p.steps.find((s) => s.state === "todo");
  const eta = p.eta_min == null ? "" : p.eta_min < 1 ? ", under a minute left" : `, about ${Math.round(p.eta_min)} min left`;
  const rn = run ? run.name.replace(/ of \d+ [a-z ]+$/i, "") : "";
  const label = run ? `${rn}${run.total ? ", " : ", "}${run.total ? `<i>${fmt(run.done || 0)}</i> of <i>${fmt(run.total)}</i>${run.unit && run.unit.length <= 14 ? " " + run.unit : ""}` : "starting"}${eta}` : "";
  el.innerHTML = `<span class="pstate"><i class="pulse"></i>Hunt running</span><ol class="psteps">${p.steps.map((s) => {
    const pct = s.state === "done" ? 100 : s.total ? Math.round((s.done / s.total) * 100) : 0;
    return `<li class="pstep ${s.state}" title="${s.name}${s.total ? `: ${fmt(s.done || 0)} of ${fmt(s.total)} ${s.unit || ""}` : ""}"><div class="nm">${s.name}</div><div class="tr"><b style="width:${pct}%"></b></div></li>`;
  }).join("")}</ol><span class="plabel">${label}</span>`;
}

let landGeo = null;
async function loadLand() {
  if (landGeo !== null) return landGeo;
  landGeo = false;
  try {
    const topo = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json")).json();
    landGeo = window.topojson ? window.topojson.feature(topo, topo.objects.land) : false;
  } catch {}
  return landGeo;
}

function locatorSvg(m, x, y, w, h) {
  const loc = m.locator || (/chesapeake/i.test(S.data.area?.name || "") ? { lon: -76, lat: 37 } : null);
  if (!loc || !landGeo) return "";
  const lon0 = loc.lon - 8, lon1 = loc.lon + 12, lat0 = loc.lat - 12, lat1 = loc.lat + 9, k = Math.cos(((loc.lat - 1.5) * Math.PI) / 180);
  const s = Math.min(w / ((lon1 - lon0) * k), h / (lat1 - lat0));
  const P = (lon, lat) => `${((lon - lon0) * k * s).toFixed(1)},${((lat1 - lat) * s).toFixed(1)}`;
  let d = "";
  const polys = landGeo.features ? landGeo.features.flatMap((f) => f.geometry) : [landGeo.geometry || landGeo];
  for (const g of polys) {
    const list = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const poly of list) for (const ring of poly) {
      if (!ring.some(([lo, la]) => lo > lon0 - 6 && lo < lon1 + 6 && la > lat0 - 6 && la < lat1 + 6)) continue;
      d += "M" + ring.map(([lo, la]) => P(lo, la)).join("L") + "Z";
    }
  }
  const [cx, cy] = P(loc.lon, loc.lat).split(",").map(Number);
  const bw = Math.max((m.w_km / 111 / Math.cos((loc.lat * Math.PI) / 180)) * k * s, 5), bh = Math.max((m.h_km / 111) * s, 5);
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="hidden"><rect width="${w}" height="${h}" fill="#F6F9FA" stroke="#1F4E6B" stroke-width="1"/><path d="${d}" fill="#EBDDB0" stroke="#1F4E6B" stroke-width=".5" stroke-linejoin="round"/><rect x="${cx - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" fill="none" stroke="#13202A" stroke-width="1.3"/><circle cx="${cx}" cy="${cy}" r="${Math.max(bw, bh) * 1.1 + 2}" fill="none" stroke="#13202A" stroke-width=".6" opacity=".5"/></svg>`;
}

function renderMap(item) {
  const m = S.data.map, box = $("#map");
  if (!m || !item.where) { box.hidden = true; $("#where").innerHTML = item.all_id ? `Also <a class="xl" href="/all.html#${item.all_id}">${item.all_id}</a> in all close-ups` : ""; return; }
  box.hidden = false;
  const W = 184, H = 168;
  const s = Math.min(W / m.w_km, H / m.h_km);
  const w = m.w_km * s, h = m.h_km * s;
  const X = (x) => x * s, Y = (y) => (m.h_km - y) * s;
  const poly = (pts) => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  let out = `<rect width="${w}" height="${h}" fill="#DDEBF2"/>`;
  (m.sonar || []).forEach((p) => (out += `<polygon points="${poly(p)}" fill="none" stroke="#1F4E6B" stroke-width=".8" stroke-dasharray="3 3" opacity=".55"/>`));
  (m.land || []).forEach((p) => (out += `<polygon points="${poly(p)}" fill="#EBDDB0" stroke="#1F4E6B" stroke-width=".9" stroke-linejoin="round"/>`));
  const all = [...S.leads, ...(S.data.known || [])].filter((it) => it.where);
  const groups = new Map();
  all.forEach((it) => { const k = it.where.x_km + "," + it.where.y_km; (groups.get(k) || groups.set(k, []).get(k)).push(it); });
  const boxes = [...groups.values()].map((g) => { const c = (g[0].where.cell_km || 5) * s; return [X(g[0].where.x_km) - c / 2 - 3, Y(g[0].where.y_km) - c / 2 - 3, c + 6, c + 6]; });
  const placed = [];
  [...(m.places || [])].sort((p, q) => /light/i.test(p.name) - /light/i.test(q.name)).forEach((p) => {
    const tw = p.name.length * 5.1, bx = X(p.x), by = Y(p.y) - 9;
    const hit = (b) => bx < b[0] + b[2] && bx + tw > b[0] && by < b[1] + b[3] && by + 11 > b[1];
    if (bx + tw > w || bx < 0 || placed.some(hit) || boxes.some(hit)) return;
    placed.push([bx, by, tw, 11]);
    out += `<text x="${bx}" y="${Y(p.y)}" class="pl">${p.name}</text>`;
  });
  const cell = (g, sel) => {
    const it = g[0], c = (it.where.cell_km || 5) * s;
    const x = X(it.where.x_km) - c / 2, y = Y(it.where.y_km) - c / 2;
    const kn = g.every((q) => q.verdict === "charted");
    const names = g.map((q) => (q.verdict === "charted" ? "Charted wreck" : "Lead " + q.rank)).join(", ");
    const badge = g.length > 1 ? `<text class="bd" x="${(x + c + 1).toFixed(1)}" y="${(y - 1).toFixed(1)}">${g.length}</text>` : "";
    return `<g class="mc" data-k="${it.where.x_km},${it.where.y_km}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${c.toFixed(1)}" height="${c.toFixed(1)}" fill="${sel ? "#A3197F" : "rgba(246,249,250,.5)"}" stroke="#A3197F" stroke-width="${sel ? 1.6 : 1.2}"${kn ? ' stroke-dasharray="2 1.5"' : ""}/>${badge}<title>${names}</title></g>`;
  };
  const selKey = item.where.x_km + "," + item.where.y_km;
  [...groups.entries()].filter(([k]) => k !== selKey).forEach(([, g]) => (out += cell(g, false)));
  out += cell(groups.get(selKey), true);
  const IW = 34, IH = 44;
  const corners = [[2, 2], [w - IW - 2, 2], [2, h - IH - 2], [w - IW - 2, h - IH - 2]];
  const cost = ([cx, cy]) => all.reduce((n, it) => {
    const x = X(it.where.x_km), y = Y(it.where.y_km);
    return n + (x > cx - 8 && x < cx + IW + 8 && y > cy - 8 && y < cy + IH + 8 ? 1 : 0);
  }, 0);
  const pick = corners.map((c, i) => [cost(c) * 10 + (i === 2 ? 3 : 0) + i * 0.1, c]).sort((p, q) => p[0] - q[0])[0][1];
  out += locatorSvg(m, pick[0].toFixed(1), pick[1].toFixed(1), IW, IH);
  const bar = 20 * s;
  const by = h - 6, bx = pick[0] < 10 && pick[1] > h / 2 ? w - bar - 6 : 6;
  out += `<g class="sb"><path d="M${bx} ${by - 3}V${by}H${bx + bar}V${by - 3}" fill="none" stroke="#13202A" stroke-width="1"/><text x="${bx + bar / 2}" y="${by - 5}" text-anchor="middle">20 km</text></g>`;
  const svg = $("#mapsvg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", w); svg.setAttribute("height", h);
  svg.innerHTML = out + `<rect width="${w}" height="${h}" fill="none" stroke="#1F4E6B" stroke-width="1"/>`;
  svg.querySelectorAll(".mc").forEach((r) => r.addEventListener("click", () => {
    const g = groups.get(r.dataset.k);
    const at = g.findIndex((x) => x.id === S.current?.id);
    select(g[(at + 1) % g.length]);
  }));
  $("#where").innerHTML = `${item.where.text || ""}${item.all_id ? `<br>Also <a class="xl" href="/all.html#${item.all_id}">${item.all_id}</a> in all close-ups` : ""}`;
}

const S = { data: null, mode: "sample", realExists: false, leads: [], cardEls: new Map(), current: null, first: true, token: 0, viewer: null };

function setUrl(mode, id) {
  const p = new URLSearchParams(location.search);
  if (mode) p.set("data", mode);
  if (id) p.set("lead", id);
  history.replaceState(null, "", "?" + p.toString());
}

function renderSwitch() {
  const el = $("#switch");
  el.innerHTML = ["sample", "real"].map((m) => {
    const dis = m === "real" && !S.realExists;
    return `<button type="button" data-m="${m}" aria-pressed="${S.mode === m}"${dis ? ' disabled title="Real results are still running"' : ""}>${m === "real" ? "Real" : "Sample"}</button>`;
  }).join("");
  el.title = S.realExists ? "Press D to flip" : "Real results are still running";
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => flip(b.dataset.m)));
}

async function flip(to) {
  if (to === S.mode || (to === "real" && !S.realExists)) return;
  const app = $("#app");
  app.classList.add("swapping");
  const keep = S.current?.id;
  const got = await loadHunt(to);
  await new Promise((r) => setTimeout(r, reduce ? 0 : 220));
  S.mode = got.mode; S.realExists = got.realExists;
  setUrl(S.mode, null);
  await mount(got.data, keep);
  requestAnimationFrame(() => app.classList.remove("swapping"));
}

function mount(data, wantLead, quiet) {
  S.data = data;
  renderSeeAll();
  renderProgress(data.progress);
  const a = data.area || {};
  $("#sub").innerHTML = `Every ship-sized bump in <i>${fmt(a.sonar_km2)}</i> km² of ${a.source || "NOAA"} sonar, minus the ones already on the chart`;
  const yrs = !a.survey_years ? "" : a.surveys === 1 ? ` - 1 survey, ${a.survey_years[0]}` : ` - ${a.surveys} surveys from ${a.survey_years[0]} to ${a.survey_years[1]}`;
  $("#meta").textContent = `${a.name || ""}${yrs}`;
  renderSwitch();
  renderFunnel(data);

  const leads = [...(data.leads || [])].sort((x, y) => x.rank - y.rank);
  const known = data.known || [];
  const items = [...leads, ...known];
  S.leads = leads;
  const cards = $("#cards");
  cards.innerHTML = "";
  const cardEls = (S.cardEls = new Map());

  leads.forEach((l) => {
    const b = document.createElement("button");
    b.className = `card v-${l.verdict}`;
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", `Lead ${l.rank}, ${VERDICT[l.verdict] || l.verdict}, ${f1(l.length_m)} metres long, ${f1(l.height_m)} metres tall, score ${sc(l.score)} of ${l.score_max}`);
    const th = thumbFor(l, 180, 120, 0.62);
    th.insertAdjacentHTML("beforeend", `<span class="rk">${l.rank}</span>${l.all_id ? `<span class="xr" title="Same object in all close-ups">${l.all_id}</span>` : ""}<span class="dp">${f1(l.depth_m)} m</span>`);
    b.append(th);
    const cap = document.createElement("span");
    cap.className = "cap";
    cap.innerHTML = `<span class="l1">${f1(l.length_m)} m long, ${f1(l.height_m)} m tall</span><span class="l2"><span><i class="dot"></i>${VERDICT[l.verdict] || l.verdict}</span><i class="sc" tabindex="-1">${sc(l.score)}</i></span>`;
    b.append(cap);
    b.addEventListener("click", () => select(l));
    bindTip(cap.querySelector(".sc"), () => l);
    cards.append(b);
    cardEls.set(l.id, b);
  });

  const rc = data.recall || {};
  const pct = rc.charted_wrecks_visible ? Math.round((rc.found / rc.charted_wrecks_visible) * 100) : 0;
  $("#recall").innerHTML = `<div class="big">${fmt(rc.found || 0)} <small>of ${fmt(rc.charted_wrecks_visible || 0)}</small></div><p>${rc.note || ""} (${pct}%)</p>`;
  const kn = $("#known");
  kn.innerHTML = "";
  known.slice(0, 5).forEach((k) => {
    const b = document.createElement("button");
    b.className = "mini";
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", `Charted wreck, ${f1(k.length_m)} metres long, re-found by the scanner`);
    b.append(thumbFor(k, 120, 78, 0.62));
    b.insertAdjacentHTML("beforeend", `<span class="m">${Math.round(k.length_m)} m<span>${Math.round(k.depth_m)} m</span></span>`);
    b.addEventListener("click", () => select(k));
    bindTip(b, () => k, knownTip);
    kn.append(b);
    cardEls.set(k.id, b);
  });
  const pick = items.find((x) => x.id === wantLead) || leads[0] || items[0];
  if (pick) return select(pick, false, quiet);
  return showEmpty(cards, quiet);
}

async function showEmpty(cards, quiet) {
  const all = await fetchJson("/data/all.json");
  const n = all?.count || 0;
  const area = window.WH_AREA && window.WH_AREA !== "chesapeake_mouth" ? "?area=" + window.WH_AREA : "";
  cards.innerHTML = `<div class="empty"><b>Nothing here survived the eye check.</b><span>Every one of the ${fmt(n)} close-ups was rock, a slope edge or a hole in the sonar. The top one is in the viewer; the rest are in <a href="/all.html${area}">All close-ups</a>.</span></div>`;
  const top = all?.items?.[0] && { ...all.items[0], verdict: all.items[0].my_verdict || "unlikely" };
  if (top) S.leads = [top];
  return top ? select(top, false, quiet) : undefined;
}

async function renderSeeAll() {
  const el = $("#seeall");
  el.hidden = true;
  if (S.mode !== "real") return;
  const all = await fetchJson("/data/all.json");
  if (!all || !all.count) return;
  S.all = all.items;
  el.innerHTML = `<span>See all <i>${fmt(all.count)}</i> close-ups, not only the shortlist</span><span>Open the full grid</span>`;
  el.hidden = false;
}

async function select(item, fromKey, quiet) {
  const same = quiet && S.current?.id === item.id;
  S.current = item;
  closeSpot();
  $("#spotbtn").hidden = S.mode !== "real";
  { const l = $("#cmplink"); l.hidden = S.mode !== "real" || !item.all_id; l.href = "/all.html#compare=" + (item.all_id || ""); }
  const my = ++S.token;
  setUrl(null, item.id);
  S.cardEls.forEach((el, id) => el.setAttribute("aria-pressed", String(id === item.id)));
  if (item.verdict === "charted") {
    const b = identityBits(item);
    $("#title3d").innerHTML = `<div class="rk">Charted</div><div class="hd">${b.name}</div><div class="sb2">${[b.kind, b.note].filter(Boolean).join(". ")}</div>${b.story ? `<div class="sb2 story" id="story">${b.story}</div><button type="button" id="more">Read more</button>` : ""}`;
    $("#more")?.addEventListener("click", (e) => { const o = $("#story").classList.toggle("open"); e.target.textContent = o ? "Show less" : "Read more"; });
  } else $("#title3d").innerHTML = `<div class="rk">${item.rank}</div><div class="hd">${item.headline || ""}</div>`;
  renderMap(item);
  $("#facts").innerHTML = factsHtml(item);
  const big = $("#big");
  big.innerHTML = `<span class="v">${sc(item.score)}<small>of ${item.score_max}</small></span><span class="w v-${item.verdict}"><i class="dot"></i>${VERDICT[item.verdict] || item.verdict}</span>${refBar(item, S.data.charted_score_median)}`;
  big.setAttribute("aria-label", `Score ${sc(item.score)} of ${item.score_max}. ${item.pulled_down || ""}`);
  $("#parts").style.setProperty("--pc", Math.max(3, Math.ceil((item.score_parts || []).length / 2)));
  $("#parts").innerHTML = (item.score_parts || []).map((p, i) => `<div class="part ${p.value < p.max - 0.35 ? "low" : ""}" tabindex="0" data-i="${i}"><div class="t"><span title="${p.name}">${p.name}</span><i>${f1(p.value)}<small>/${p.max}</small></i></div><div class="bar"><b style="width:${(p.value / p.max) * 100}%"></b></div><div class="w">${p.why}</div></div>`).join("");
  $("#parts").querySelectorAll(".part").forEach((el) => bindTip(el, () => item));
  $("#pulled").innerHTML = `<b>What pulled it down:</b> ${item.pulled_down || "nothing"}`;
  const hf = await loadHf(item);
  if (my !== S.token) return;
  if (hf && !same) {
    S.viewer.set(hf, S.first, item);
    S.viewer.face(item.heading_deg || 0, item.length_m);
    $("#hint").textContent = `Height stretched ${f1(Math.min(Math.max(14 / (item.height_m || 3), 3), 6))}x. Drag to turn, right-drag to move, double-click to center.`;
    if (S.first) S.viewer.startSweep();
    S.first = false;
  }
  drawProfile(item, hf);
  if (fromKey) S.cardEls.get(item.id)?.focus({ preventScroll: false });
}

async function boot() {
  contourBackdrop();
  S.viewer = makeViewer();
  const got = await loadHunt(params.get("data"));
  S.mode = got.mode; S.realExists = got.realExists;
  setUrl(S.mode, null);
  loadLand().then(() => S.current && renderMap(S.current));
  setInterval(async () => {
    if (document.hidden || S.mode !== "real" || (S.data?.progress?.state !== "running" && S.data?.status !== "running")) return;
    const fresh = await fetchJson("/data/hunt.json");
    if (fresh && fresh.generated_at !== S.data.generated_at) mount(fresh, S.current?.id, true);
  }, 30000);
  bindTip($("#big"), () => S.current);
  mountSearch($("#search"), {
    entries: () => {
      const lead = [...S.leads, ...(S.data?.known || [])];
      const mapped = new Set(lead.map((x) => x.all_id).filter(Boolean));
      const e = lead.map((x) => ({ kind: "lead", item: x, ids: [x.id, x.all_id].filter(Boolean), title: x.verdict === "charted" ? [x.vessel?.name, x.headline].filter(Boolean).join(", ") : x.headline, name: x.vessel?.name || "", score: x.score, text: textOf([x.id, x.all_id, x.headline, x.verdict, x.vessel?.name, x.chart_category, x.verdict === "charted" ? "charted wreck known" : "lead shortlist"]) }));
      (S.all || []).filter((x) => !mapped.has(x.id)).forEach((x) => e.push({ kind: "all", item: x, ids: [x.id], title: x.name && x.group === "charted" ? `${x.vessel?.name || x.name}, ${x.headline}` : x.headline, name: x.vessel?.name || "", score: x.score, text: textOf([x.id, x.headline, x.my_verdict, x.group_label, x.vessel?.name, x.chart_category]) }));
      return e;
    },
    open: (e) => { if (e.kind === "lead") select(e.item); else location.href = "/all.html#" + e.item.id; },
  });
  $("#spotbtn").addEventListener("click", () => S.current && openSpot(S.current.id));
  $("#zin").addEventListener("click", () => S.viewer.zoomBy(1 / 1.35));
  $("#zout").addEventListener("click", () => S.viewer.zoomBy(1.35));
  $("#zfit").addEventListener("click", () => S.viewer.refit());
  addEventListener("keydown", (e) => {
    if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey) {
      flip(S.mode === "real" ? "sample" : "real");
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && ["+", "=", "-", "_"].includes(e.key)) { S.viewer.zoomBy(e.key === "+" || e.key === "=" ? 1 / 1.35 : 1.35); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const leads = S.leads;
    const k = leads.findIndex((l) => l.id === S.current?.id);
    const at = k < 0 ? 0 : k;
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -4 : 4;
    const n = Math.min(Math.max(at + step, 0), leads.length - 1);
    if (n === k && k >= 0) return;
    e.preventDefault();
    select(leads[n], true);
  });
  new ResizeObserver(() => S.current && loadHf(S.current).then((hf) => drawProfile(S.current, hf))).observe($("#profile"));
  await mount(got.data, params.get("lead"));
  document.querySelectorAll(".rise").forEach((el, i) => el.style.setProperty("--d", `${0.08 + i * 0.1}s`));
  requestAnimationFrame(() => document.body.classList.add("ready"));
}

boot().catch((e) => {
  $("#sub").textContent = "No hunt data yet";
  document.body.classList.add("ready");
  console.error(e);
});
