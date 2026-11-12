import { openSpot, closeSpot } from "/where.js";
import { mountSearch, textOf } from "/search.js";
import { openCompare, closeCompare, isCompareOpen } from "/compare.js";
import { buildAll, similarity } from "/shape.js";
import { $, reduce, fmt, f1, sc, fetchJson, loadHf, paintThumb, contourBackdrop, makeViewer, drawProfile } from "/lib.js";

const GROUPS = [["all", "All"], ["charted", "Known wrecks (on NOAA charts)"], ["uncharted", "New finds (on no chart)"], ["in_charted_area", "Inside charted reef areas"]];
const CLAUDE = [["any", "Any"], ["ship-like", "Ship-like"], ["maybe", "Worth a look"], ["unlikely", "Ruled out"], ["none", "Not checked yet"]];
const ROY = [["any", "Any"], ["keep", "Keep"], ["drop", "Drop"], ["unsure", "Unsure"], ["none", "Not yet"]];
const SORTS = {
  rank: ["Claude's order", (a, b) => a.rank - b.rank],
  score: ["Score, high first", (a, b) => b.score - a.score],
  sharp: ["Sharpness, high first", (a, b) => (b.sharpness_x || 0) - (a.sharpness_x || 0)],
  height: ["Height, tall first", (a, b) => b.height_m - a.height_m],
  length: ["Length, long first", (a, b) => b.length_m - a.length_m],
  depth: ["Depth, shallow first", (a, b) => a.depth_m - b.depth_m],
};
SORTS.sim = ["Most like the one you picked", (a, b) => (S.sim.get(b.id) ?? -1) - (S.sim.get(a.id) ?? -1)];
const CMARK = { "ship-like": ["Ship-like", "ring"], maybe: ["Worth a look", "ring"], unlikely: ["Ruled out", "grey"], charted: ["Verified wreck", "buff"], in_area: ["Charted reef area", "grey"] };
const MAXC = 12;
const RLABEL = { keep: "Keep", drop: "Drop", unsure: "Unsure" };

const S = { picks: [], desc: null, sim: new Map(), simSeed: null, simMode: "true", items: [], byId: new Map(), verdicts: {}, f: { group: "all", claude: "any", roy: "any" }, sort: "rank", list: [], idx: -1, open: false, viewer: null, median: null, first: true, token: 0 };
const nodes = new Map();
{ const q = new URLSearchParams(location.search); for (const [k, opts] of [["group", GROUPS], ["claude", CLAUDE]]) { const v = q.get(k); if (opts.some((o) => o[0] === v)) S.f[k] = v; } }
let noteTimer = null;

const vOf = (id) => S.verdicts[id]?.verdict || null;

function chips(key, opts, counts) {
  const el = document.createElement("select");
  el.className = "fsel";
  el.innerHTML = opts.map(([v, label]) => `<option value="${v}">${label}${counts?.[v] != null ? ` (${counts[v].toLocaleString("en-US")})` : ""}</option>`).join("");
  el.addEventListener("change", () => { S.f[key] = el.value; syncChips(); applyFilters(); });
  return el;
}
function syncChips() {
  document.querySelectorAll("#filters .fsel").forEach((sel) => {
    sel.value = S.f[sel.dataset.key];
    sel.classList.toggle("on", sel.selectedIndex > 0);
  });
}

function buildFilters(groups) {
  const f = $("#filters");
  const mk = (label, key, opts, counts) => {
    const g = document.createElement("label");
    g.className = "fg";
    g.innerHTML = `<span>${label}</span>`;
    const seg = chips(key, opts, counts);
    seg.dataset.key = key;
    g.append(seg);
    return g;
  };
  const counts = { all: S.items.length, uncharted: groups.uncharted, charted: groups.charted, in_charted_area: groups.in_charted_area };
  f.append(mk("What it is", "group", GROUPS, counts), mk("Claude checked", "claude", CLAUDE), mk("You checked", "roy", ROY));
  const q = document.createElement("div");
  q.className = "fg";
  q.innerHTML = '<input id="search" class="search inline" type="search" placeholder="Search A009, Santore, scour   /" aria-label="Search" autocomplete="off" spellcheck="false">';
  $(".row1").insertBefore(q, $(".back"));
  const s = document.createElement("div");
  s.className = "fg";
  s.innerHTML = `<span>Sort</span><select id="sort" aria-label="Sort">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join("")}</select>`;
  s.querySelector("select").addEventListener("change", (e) => { S.sort = e.target.value; applyFilters(); });
  f.append(s);
  syncChips();
}

function passes(it) {
  const f = S.f, rv = vOf(it.id);
  if (f.group !== "all" && it.group !== f.group) return false;
  if (f.claude !== "any" && (f.claude === "none" ? it.my_verdict != null : it.my_verdict !== f.claude)) return false;
  if (f.roy !== "any" && (f.roy === "none" ? rv != null : rv !== f.roy)) return false;
  return true;
}

function applyFilters() {
  S.list = S.items.filter(passes).sort(SORTS[S.sort][1]);
  $("#wall").replaceChildren(...S.list.map((it) => nodes.get(it.id)));
  $("#empty").hidden = S.list.length > 0;
  updateSimLabels();
}

function tally() {
  const ids = Object.keys(S.verdicts).filter((id) => S.byId.has(id));
  const kept = ids.filter((id) => S.verdicts[id].verdict === "keep").length;
  const n = S.items.length;
  $("#tally").innerHTML = `You've looked at <i>${ids.length}</i> of <i>${n}</i>, kept <i>${kept}</i><span class="bar"><b style="width:${(ids.length / n) * 100}%"></b></span>`;
}

function claudeMark(it) {
  const m = CMARK[it.my_verdict];
  return m ? `<span class="cm" title="Claude's hand check: ${m[0].toLowerCase()}"><i class="dot ${m[1]}"></i>${m[0]}</span>` : "";
}

function paintCard(it) {
  const el = nodes.get(it.id);
  const rv = vOf(it.id);
  el.className = `card${rv ? " rk-" + rv : ""}`;
  el.querySelector(".rv")?.remove();
  if (rv) el.querySelector(".thumb").insertAdjacentHTML("beforeend", `<span class="rv ${rv}">${RLABEL[rv]}</span>`);
  el.setAttribute("aria-label", `${it.id}, ${f1(it.length_m)} metres long, ${f1(it.height_m)} metres tall, score ${sc(it.score)}${rv ? ", you said " + rv : ""}`);
}

function buildCards() {
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const c = e.target, it = S.byId.get(c.dataset.id);
      io.unobserve(c);
      loadHf(it).then((hf) => hf && paintThumb(c, hf, 0.62));
    });
  }, { rootMargin: "500px 0px" });
  S.items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.id = it.id;
    b.innerHTML = `<span class="thumb"><canvas width="176" height="118" data-id="${it.id}"></canvas>${claudeMark(it)}<span class="cmpbtn" role="checkbox" aria-checked="false" tabindex="0" title="Add to compare"><i></i>Compare</span><span class="dp">${f1(it.depth_m)} m</span></span><span class="cap"><span class="l1">${f1(it.length_m)} m long, ${f1(it.height_m)} m tall</span><span class="l2"><span class="id">${it.id}${S.short.get(it.id) ? ` (${S.short.get(it.id)})` : ""}</span><i class="sc" title="Score out of ${it.score_max}">${sc(it.score)}</i></span></span>`;
    b.addEventListener("click", () => go(it.id));
    const cb = b.querySelector(".cmpbtn");
    cb.addEventListener("click", (e) => { e.stopPropagation(); togglePick(it.id); });
    cb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); togglePick(it.id); } });
    nodes.set(it.id, b);
    paintCard(it);
    io.observe(b.querySelector("canvas"));
  });
}

const labelOf = (it) => (it.group === "charted" ? it.vessel?.name || `Charted ${it.id}` : it.id);

function togglePick(id) {
  const i = S.picks.indexOf(id);
  if (i >= 0) S.picks.splice(i, 1);
  else if (S.picks.length < MAXC) S.picks.push(id);
  else return;
  pickUI();
}

function pickUI() {
  nodes.forEach((el, id) => el.querySelector(".cmpbtn").setAttribute("aria-checked", String(S.picks.includes(id))));
  const cur = S.list[S.idx];
  $("#dcmp").setAttribute("aria-pressed", String(!!cur && S.picks.includes(cur.id)));
  $("#dcmp").firstChild.nodeValue = cur && S.picks.includes(cur.id) ? "In compare " : "Add to compare ";
  renderTray();
}

function renderTray() {
  const t = $("#tray");
  document.body.classList.toggle("hastray", S.picks.length > 0);
  if (!S.picks.length) { t.hidden = true; return; }
  t.hidden = false;
  t.innerHTML = `<span class="tt">Compare</span>${S.picks.map((id) => `<div class="tchip" title="${labelOf(S.byId.get(id))}"><canvas width="64" height="42" data-id="${id}"></canvas><span>${labelOf(S.byId.get(id))}</span><button type="button" data-id="${id}" aria-label="Remove ${id}">&times;</button></div>`).join("")}<span class="grow"></span><button type="button" class="btn" id="tadd">Add 3 real wrecks</button><button type="button" class="btn" id="tclear">Clear</button><button type="button" class="btn primary" id="tgo"${S.picks.length < 2 ? " disabled" : ""}>Compare (${S.picks.length})</button>`;
  t.querySelectorAll("canvas").forEach((c) => loadHf(S.byId.get(c.dataset.id)).then((hf) => hf && paintThumb(c, hf, 0.62)));
  t.querySelectorAll(".tchip button").forEach((b) => b.addEventListener("click", () => togglePick(b.dataset.id)));
  $("#tadd").addEventListener("click", addReal);
  $("#tclear").addEventListener("click", () => { S.picks = []; pickUI(); });
  $("#tgo").addEventListener("click", startCompare);
}

function addReal() {
  const real = S.items.filter((x) => x.group === "charted" && !S.picks.includes(x.id)).sort((a, b) => b.score - a.score);
  for (const r of real.slice(0, 3)) if (S.picks.length < MAXC) S.picks.push(r.id);
  pickUI();
}

function hideDetailOnly() {
  if (!S.open) return;
  flushNote();
  S.open = false;
  $("#detail").hidden = true;
  S.viewer.pause(true);
}

function defaultPicks() {
  if (S.picks.length) return;
  const top = (f) => S.items.filter(f).sort((a, b) => b.score - a.score).slice(0, 4).map((x) => x.id);
  S.picks = [...top((x) => x.my_verdict === "ship-like" || x.my_verdict === "maybe"), ...top((x) => x.group === "charted")];
  pickUI();
}

const nav = (h, replace) => {
  const u = location.pathname + location.search + (h ? "#" + h : "");
  if (replace) history.replaceState(history.state, "", u);
  else history.pushState({ d: (history.state?.d || 0) + 1 }, "", u);
};
const go = (h) => { nav(h); route(); };
const back = () => { if (history.state?.d) history.back(); else { nav("", true); route(); } };
const cmpHash = () => "compare=" + S.picks.join(",");

function startCompare() {
  if (S.picks.length) go(cmpHash());
}

let lastD = null;
function route() {
  if (history.state == null && lastD != null) history.replaceState({ d: lastD + 1 }, "");
  lastD = history.state?.d || 0;
  const h = location.hash.slice(1);
  if (h === "compare" || h.startsWith("compare=")) {
    const ids = h.slice(8).split(",").filter((x) => S.byId.has(x));
    if (ids.length === 1 && S.picks.length) { if (!S.picks.includes(ids[0])) togglePick(ids[0]); }
    else if (ids.length) S.picks = ids.slice(0, MAXC);
    defaultPicks();
    if (S.picks.length < 2) addReal();
    pickUI();
    nav(cmpHash(), true);
    showCompare();
  } else if (h && S.byId.has(h)) {
    if (isCompareOpen()) closeCompare();
    if (!(S.open && S.list[S.idx]?.id === h)) openDetail(h);
  } else {
    if (isCompareOpen()) closeCompare();
    closeDetail();
  }
}

async function showCompare() {
  if (!S.picks.length) return;
  pinTop();
  hideDetailOnly();
  closeSpot();
  openCompare({
    items: S.picks.map((id) => S.byId.get(id)),
    pool: [
      ["Known wrecks, already on NOAA charts", S.items.filter((x) => x.group === "charted").sort((a, b) => b.length_m - a.length_m)],
      ["New finds, on no chart, Claude said worth a look", S.items.filter((x) => x.my_verdict === "ship-like" || x.my_verdict === "maybe").sort((a, b) => b.score - a.score)],
    ],
    max: MAXC,
    toggle: (id) => { togglePick(id); nav(cmpHash(), true); return S.picks.map((x) => S.byId.get(x)); },
    loader: loadHf,
    label: labelOf,
    verdictOf: vOf,
    open: (it) => go(it.id),
    back,
    remove: (id) => { S.picks = S.picks.filter((x) => x !== id); pickUI(); nav(cmpHash(), true); },
    onClose: () => { document.body.classList.toggle("detail-open", S.open); if (!S.open && S.savedY != null) { scrollTo(0, S.savedY); S.savedY = null; } },
  });
}

function updateSimLabels() {
  nodes.forEach((el, id) => {
    const s = el.querySelector(".l2 > span:first-child");
    if (S.simSeed && S.sim.has(id)) { s.className = "sim"; s.textContent = id === S.simSeed ? "This one" : `${Math.round(S.sim.get(id) * 100)}% alike`; }
    else { s.className = "id"; s.textContent = id + (S.short.get(id) ? ` (${S.short.get(id)})` : ""); }
  });
}

function drawSimbar(progress) {
  const bar = $("#simbar");
  if (!S.simSeed && !progress) { bar.hidden = true; return; }
  bar.hidden = false;
  if (progress) { bar.innerHTML = `<span class="prog">Reading shapes, ${progress[0]} of ${progress[1]}</span>`; return; }
  bar.innerHTML = `<span>Most like <b>${labelOf(S.byId.get(S.simSeed))}</b></span><div class="seg" id="smode"><button type="button" class="chip" data-v="true" aria-pressed="${S.simMode === "true"}">Size and shape</button><button type="button" class="chip" data-v="shape" aria-pressed="${S.simMode === "shape"}">Shape only</button></div><span class="grow"></span><button type="button" class="btn" id="sclear">Clear</button>`;
  bar.querySelectorAll("#smode .chip").forEach((c) => c.addEventListener("click", () => { S.simMode = c.dataset.v; computeSim(); drawSimbar(); applyFilters(); }));
  $("#sclear").addEventListener("click", clearSim);
}

function computeSim() {
  const seed = S.desc.get(S.simSeed);
  S.sim = new Map();
  S.items.forEach((it) => { const d = S.desc.get(it.id); if (d && seed) S.sim.set(it.id, it.id === S.simSeed ? 1 : similarity(seed, d, S.simMode)); });
}

function clearSim() {
  S.simSeed = null; S.sim = new Map();
  if (S.sort === "sim") { S.sort = "rank"; $("#sort").value = "rank"; }
  $("#sort option[value=sim]")?.remove();
  drawSimbar();
  applyFilters();
}

async function findSimilar(id) {
  hideDetailOnly();
  closeSpot();
  document.body.classList.remove("detail-open");
  nav("");
  S.f = { group: "all", claude: "any", roy: "any" };
  syncChips();
  if (!S.desc) S.desc = await buildAll(S.items, loadHf, (d, n) => drawSimbar([d, n]));
  S.simSeed = id;
  computeSim();
  if (!$("#sort option[value=sim]")) $("#sort").insertAdjacentHTML("afterbegin", `<option value="sim">${SORTS.sim[0]}</option>`);
  S.sort = "sim"; $("#sort").value = "sim";
  drawSimbar();
  applyFilters();
  scrollTo(0, 0);
}

async function post(id, verdict, note) {
  const r = await fetch("/api/verdict", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, verdict, note: note || "" }) });
  if (!r.ok) throw new Error("save failed " + r.status);
}

function msg(t) { $("#savemsg").textContent = t; }

async function setVerdict(id, v) {
  clearTimeout(noteTimer);
  const before = S.verdicts[id];
  if (before?.verdict === v) v = null;
  const note = v ? $("#note").value : "";
  if (v) S.verdicts[id] = { verdict: v, note, at: new Date().toISOString() };
  else delete S.verdicts[id];
  paintCard(S.byId.get(id));
  tally();
  syncDecide();
  try {
    await post(id, v, note);
    msg(v ? `Saved as ${v}` : "Cleared");
    if (v && S.open && S.list[S.idx]?.id === id && !$("#note").value.trim()) setTimeout(() => step(1, true), reduce ? 0 : 160);
  } catch {
    if (before) S.verdicts[id] = before; else delete S.verdicts[id];
    paintCard(S.byId.get(id)); tally(); syncDecide();
    msg("Could not save, try again");
  }
}

function flushNote() {
  if (noteTimer == null) return;
  clearTimeout(noteTimer);
  noteTimer = null;
  const it = S.list[S.idx], v = it && S.verdicts[it.id];
  if (v) { v.note = $("#note").value; post(it.id, v.verdict, v.note).catch(() => msg("Could not save the note")); }
}

function syncDecide() {
  const it = S.list[S.idx];
  const rv = it ? vOf(it.id) : null;
  document.querySelectorAll("#decide button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === rv)));
}

function factsHtml(it) {
  const r = (l, v, u) => `<div><dd>${v}<small>${u}</small></dd><dt>${l}</dt></div>`;
  return [r("Length", f1(it.length_m), " m"), r("Width", f1(it.width_m), " m"), r("Height", f1(it.height_m), " m"), r("Water depth", f1(it.depth_m), " m"), r("Edges sharper than seabed", f1(it.sharpness_x ?? 0), "x")].join("");
}

async function showItem(it) {
  const my = ++S.token;
  closeSpot();
  nav(it.id, true);
  pickUI();
  const pos = S.idx + 1;
  $("#dpos").innerHTML = `<i>${pos}</i> of ${S.list.length} in this list`;
  $("#dprev").disabled = S.idx <= 0;
  $("#dnext").disabled = S.idx >= S.list.length - 1;
  const cm = CMARK[it.my_verdict];
  $("#dhead").innerHTML = `<i>${it.rank}</i>${it.name && it.group === "charted" ? it.name : it.headline}`;
  $("#dsub").innerHTML = `<span>${it.group_label}</span>${S.short.get(it.id) ? `<span>Also ${S.short.get(it.id)} on the shortlist</span>` : ""}${it.my_verdict === "charted" ? "" : cm ? `<span><i class="dot ${cm[1]}"></i>Claude said ${cm[0].toLowerCase()}</span>` : "<span>Claude has not looked at this one</span>"}<span>${it.where?.text || ""}</span>`;
  $("#dfacts").innerHTML = factsHtml(it);
  $("#title3d").innerHTML = `<div class="rk">${it.id}</div>`;
  $("#note").value = S.verdicts[it.id]?.note || "";
  msg("");
  syncDecide();
  const med = S.median;
  $("#dtotal").innerHTML = `<div class="v">${sc(it.score)}<small>of ${it.score_max}</small></div><div class="m">${med != null ? `Charted wrecks score ${sc(med)} in the middle` : ""}</div>`;
  $("#dparts").innerHTML = (it.score_parts || []).map((p) => `<div class="part ${p.value < p.max - 0.35 ? "low" : ""}"><span class="nm" title="${p.name}">${p.name}</span><div class="bar"><b style="width:${(p.value / p.max) * 100}%"></b></div><i>${f1(p.value)}/${p.max}</i><span class="why" title="${p.why}">${p.why}</span></div>`).join("");
  $("#dpulled").innerHTML = `<b>What pulled it down:</b> ${it.pulled_down || "nothing"}`;
  const id = $("#did");
  if (it.group === "charted" || it.chart_category) {
    const v = it.vessel;
    const when = v ? (v.sunk ? `sunk ${v.sunk}` : v.reported ? `first reported ${v.reported}` : "") : "";
    id.hidden = false;
    id.innerHTML = `<b>${v?.name || it.name || "Unnamed on NOAA charts"}</b>. ${[it.chart_category, it.charted_year ? "charted " + it.charted_year : "", when].filter(Boolean).join(", ")}${it.chart_note ? `. ${it.chart_note}` : ""}${v?.story ? `<div class="st">${v.story}</div>` : ""}`;
  } else id.hidden = true;
  const hf = await loadHf(it);
  if (my !== S.token) return;
  if (hf) {
    S.viewer.face(it.heading_deg || 0, it.length_m);
    S.viewer.set(hf, S.first, it);
    $("#hint").textContent = `Drag to turn, right-drag to move, double-click to center.`;
    if (S.first) S.viewer.startSweep();
    S.first = false;
  }
  drawProfile(it, hf);
}

function openDetail(id) {
  const i = S.list.findIndex((x) => x.id === id);
  if (i < 0) { S.list = S.items.slice().sort(SORTS[S.sort][1]); S.idx = S.list.findIndex((x) => x.id === id); } else S.idx = i;
  if (S.idx < 0) return;
  pinTop();
  S.open = true;
  $("#detail").hidden = false;
  document.body.classList.add("detail-open");
  S.viewer.pause(false);
  showItem(S.list[S.idx]);
  requestAnimationFrame(() => { scrollTo(0, 0); navGap(); });
}

function navGap() {
  document.documentElement.style.setProperty("--navgap", Math.max(0, 36 - scrollY) + "px");
}

function pinTop() {
  if (S.savedY == null && scrollY > 0) S.savedY = scrollY;
  scrollTo(0, 0);
  navGap();
}

function closeDetail() {
  if (!S.open) return;
  S.savedY = null;
  flushNote();
  S.open = false;
  $("#detail").hidden = true;
  document.body.classList.remove("detail-open");
  S.viewer.pause(true);
  applyFilters();
  const el = nodes.get(S.list[S.idx]?.id);
  el?.focus({ preventScroll: true });
  el?.scrollIntoView({ block: "center" });
}

function step(d, fromVerdict) {
  const n = S.idx + d;
  if (n < 0 || n >= S.list.length) { if (fromVerdict) msg("That was the last one in this list"); return; }
  flushNote();
  S.idx = n;
  showItem(S.list[n]);
}

async function boot() {
  contourBackdrop();
  const [all, verdicts, hunt] = await Promise.all([fetchJson("/data/all.json"), fetchJson("/api/verdict"), fetchJson("/data/hunt.json")]);
  S.short = new Map();
  [...(hunt?.leads || []), ...(hunt?.known || [])].forEach((x) => x.all_id && S.short.set(x.all_id, x.id));
  if (!all) { $("#tally").textContent = "No close-ups yet. Real results are still running."; return; }
  S.items = all.items;
  S.items.forEach((it) => S.byId.set(it.id, it));
  S.verdicts = verdicts || {};
  S.median = all.charted_score_median;
  buildFilters(all.groups || {});
  buildCards();
  tally();
  applyFilters();
  S.viewer = makeViewer();
  S.viewer.pause(true);
  mountSearch($("#search"), {
    entries: () => S.items.map((x) => ({ item: x, ids: [x.id, S.short.get(x.id)].filter(Boolean), title: x.group === "charted" ? [x.vessel?.name, x.headline].filter(Boolean).join(", ") : x.headline, name: x.vessel?.name || "", score: x.score, text: textOf([x.id, S.short.get(x.id), x.headline, x.my_verdict, S.verdicts[x.id]?.verdict, S.verdicts[x.id]?.note, x.group_label, x.vessel?.name, x.chart_category, x.chart_note, S.short.has(x.id) ? "shortlist" : ""]) })),
    open: (e) => go(e.item.id),
    canFocus: () => !S.open && !isCompareOpen(),
  });

  $("#cmpgo").addEventListener("click", () => { defaultPicks(); startCompare(); });
  $("#dback").addEventListener("click", back);
  $("#dcmp").addEventListener("click", () => { const it = S.list[S.idx]; if (it) togglePick(it.id); });
  $("#dsim").addEventListener("click", () => { const it = S.list[S.idx]; if (it) findSimilar(it.id); });
  $("#spotbtn").addEventListener("click", () => S.open && openSpot(S.list[S.idx].id));
  $("#dprev").addEventListener("click", () => step(-1));
  $("#dnext").addEventListener("click", () => step(1));
  $("#zin").addEventListener("click", () => S.viewer.zoomBy(1 / 1.35));
  $("#zout").addEventListener("click", () => S.viewer.zoomBy(1.35));
  $("#zfit").addEventListener("click", () => S.viewer.refit());
  document.querySelectorAll("#decide button").forEach((b) => b.addEventListener("click", () => S.open && setVerdict(S.list[S.idx].id, b.dataset.v)));
  $("#note").addEventListener("input", () => {
    const it = S.list[S.idx];
    if (!it || !S.verdicts[it.id]) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { noteTimer = null; const v = S.verdicts[it.id]; if (v) { v.note = $("#note").value; post(it.id, v.verdict, v.note).then(() => msg("Note saved")).catch(() => msg("Could not save the note")); } }, 700);
  });

  addEventListener("keydown", (e) => {
    if (isCompareOpen() && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === "Escape") { e.preventDefault(); back(); }
      return;
    }
    if (!S.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = ["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName);
    if (e.key === "Escape") { if (typing) document.activeElement.blur(); else back(); e.preventDefault(); return; }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (k === "k") setVerdict(S.list[S.idx].id, "keep");
    else if (k === "x") setVerdict(S.list[S.idx].id, "drop");
    else if (k === "u") setVerdict(S.list[S.idx].id, "unsure");
    else if (k === "c") togglePick(S.list[S.idx].id);
    else if (["+", "=", "-", "_"].includes(e.key)) S.viewer.zoomBy(e.key === "+" || e.key === "=" ? 1 / 1.35 : 1.35);
  });
  addEventListener("beforeunload", flushNote);

  route();
  addEventListener("popstate", route);
  addEventListener("scroll", navGap, { passive: true });
  addEventListener("resize", navGap);
  navGap();
}

boot().catch((e) => { $("#tally").textContent = "Could not load the close-ups"; console.error(e); });
