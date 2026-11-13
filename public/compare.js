import { f1, sc } from "/lib.js";
import { centreOf, frame, paintField, contourSegs, profile } from "/shape.js";
import { show3d, hide3d, fit3d } from "/cmp3d.js";
import { drawMap } from "/cmpmap.js";
import { showWhole, hideWhole } from "/wholescan.js";
import { shareUrl, copyShare } from "/share.js";

const $ = (s) => document.querySelector(s);
const INK = ["#0E7C7B", "#1F5FA0", "#4C8C2B", "#2E4A62", "#3AA0A0"];
const MAG = ["#C2187F", "#E0559F", "#8A1068", "#F08AC4", "#B5127D"];
const known = (it) => it.group === "charted";
const TAG = (it) => (known(it) ? `<em class="tag known">Known wreck</em>` : `<em class="tag new">New find</em>`);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const LW = (it, base) => (known(it) ? base * 0.8 : base * 1.3);
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200];
const CNAME = { "ship-like": "Ship-like", maybe: "Worth a look", unlikely: "Ruled out", charted: "Verified wreck", in_area: "Charted reef area" };

const st = { items: [], hfs: new Map(), cen: new Map(), ctx: null, mode: "true", stretch: 0, open: false, zoom: 1, view: "pics", lay: "row", map: false, around: 0, wide: new Map() };

export const isCompareOpen = () => st.open;

export function closeCompare() {
  if (!st.open) return;
  st.open = false;
  $("#cmpview").hidden = true;
  hide3d();
  hideWhole();
  document.body.classList.remove("detail-open");
  st.ctx?.onClose?.();
}

function colorsFor(items) {
  let a = 0, b = 0;
  return items.map((it) => (it.group === "charted" ? INK[a++ % INK.length] : MAG[b++ % MAG.length]));
}

let urlRead = false;
function readUrlState() {
  if (urlRead) return;
  urlRead = true;
  const q = new URLSearchParams(location.search);
  if (["pics", "3d"].includes(q.get("view"))) st.view = q.get("view");
  if (["row", "stack", "real"].includes(q.get("lay"))) st.lay = q.get("lay");
  if (["true", "match"].includes(q.get("size"))) st.mode = q.get("size");
  if (q.get("around") === "whole" || ["250", "500", "1000"].includes(q.get("around"))) st.around = q.get("around") === "whole" ? "whole" : Number(q.get("around"));
  if (["1", "3", "6"].includes(q.get("stretch"))) st.stretch = Number(q.get("stretch"));
}
const shareState = () => ({ view: st.view === "3d" ? "3d" : null, lay: st.lay !== "row" ? st.lay : null, size: st.mode !== "true" ? st.mode : null, around: st.view === "3d" && st.around ? st.around : null, stretch: st.stretch || null });

export async function openCompare(ctx) {
  readUrlState();
  st.ctx = ctx;
  st.items = ctx.items.slice(0, ctx.max || 8);
  st.open = true;
  st.zoom = 1;
  $("#cmpview").hidden = false;
  document.body.classList.add("detail-open");
  wire();
  await refresh();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $("#cclose").addEventListener("click", () => (st.ctx?.back ? st.ctx.back() : closeCompare()));
  $("#cshare").addEventListener("click", () => copyShare($("#cshare"), shareUrl(st.items.map((it) => it.id), shareState())));
  const seg = (id, key, cast) => document.querySelectorAll(`#${id} .chip`).forEach((c) => c.addEventListener("click", () => { st[key] = cast(c.dataset.v); sync(); render(); }));
  seg("csize", "mode", String);
  seg("cstretch", "stretch", Number);
  seg("cview", "view", String);
  seg("clay", "lay", String);
  seg("caround", "around", (v) => (v === "whole" ? v : Number(v)));
  $("#cmapb").addEventListener("click", () => { st.map = !st.map; sync(); render(); });
  document.querySelectorAll("#czoom .chip").forEach((c) => c.addEventListener("click", () => (c.dataset.z === "fit" && fit3d(), zoomTo(c.dataset.z === "fit" ? 1 : st.zoom * (c.dataset.z === "in" ? 1.4 : 1 / 1.4)))));
  ["#cside", "#cstack", "#cprof"].forEach((id) => $(id).addEventListener("wheel", (e) => { if (id === "#cside" && st.view === "3d") return; e.preventDefault(); zoomTo(st.zoom * Math.exp(-e.deltaY * 0.0025)); }, { passive: false }));
  addEventListener("keydown", (e) => {
    if (!st.open || e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (e.key === "+" || e.key === "=") zoomTo(st.zoom * 1.4);
    else if (e.key === "-" || e.key === "_") zoomTo(st.zoom / 1.4);
    else if (e.key === "0") zoomTo(1);
  });
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => st.open && render(), 150); });
}

let raf = 0;
function zoomTo(z) {
  st.zoom = Math.min(10, Math.max(0.3, z));
  $("#zval").textContent = `${st.zoom.toFixed(1)}x`;
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
}

function sync() {
  $("#zval").textContent = `${st.zoom.toFixed(1)}x`;
  document.querySelectorAll("#csize .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.v === st.mode)));
  document.querySelectorAll("#cstretch .chip").forEach((c) => c.setAttribute("aria-pressed", String(+c.dataset.v === st.stretch)));
  document.querySelectorAll("#cview .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.v === st.view)));
  document.querySelectorAll("#clay .chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.v === st.lay)));
  $("#cmapb").setAttribute("aria-pressed", String(st.map));
  document.querySelectorAll("#caround .chip").forEach((c) => c.setAttribute("aria-pressed", String(String(c.dataset.v) === String(st.around))));
}

async function refresh() {
  sync();
  await Promise.all(st.items.map(async (it) => {
    if (st.hfs.has(it.id)) return;
    const hf = await st.ctx.loader(it);
    if (hf) { st.hfs.set(it.id, hf); st.cen.set(it.id, centreOf(hf)); }
  }));
  st.items = st.items.filter((it) => st.hfs.has(it.id));
  render();
}

function render() {
  if (!st.open) return;
  const items = st.items, cols = colorsFor(items);
  $("#cn").textContent = `Compare (${items.length} of ${st.ctx.max || 8})`;
  picker(items, cols);
  document.querySelectorAll("#cmpview .cp").forEach((p) => { p.hidden = !items.length; });
  $("#cempty").hidden = !!items.length;
  if (!items.length) return;
  const d3 = st.view === "3d";
  $("#tiles").hidden = d3;
  $("#c3d").hidden = !d3;
  $("#cmpview").classList.toggle("v3d", d3);
  const real = d3 && st.lay === "real";
  $("#cmpview").classList.toggle("vreal", real);
  if (real) { hide3d(); showWhole({ host: $("#c3dw"), items, cols, label: st.ctx.label, onOpen: st.ctx.open, stretch: st.stretch, note: (t) => { $("#c3dh").textContent = t; } }); }
  else hideWhole();
  if (d3 && !real) { if (st.around) loadWide(items).then(() => st.open && st.view === "3d" && st.lay !== "real" && go3d(st.items, colorsFor(st.items))); go3d(items, cols); }
  else if (!d3) { hide3d(); tiles(items, cols); }
  $("#c3dmap").hidden = !(d3 && st.map && !real);
  if (d3 && st.map && !real) drawMap($("#c3dmap"), items, cols, st.ctx.label);
  stack(items, cols);
  profiles(items, cols);
  facts(items, cols);
}

const spanOf = () => (st.around === "whole" ? 1000 : st.around);
function go3d(items, cols) {
  const whole = st.around === "whole";
  const wides = new Map(items.map((it) => [it.id, st.around ? st.wide.get(it.id + "_" + spanOf()) || null : null]));
  const n = [...wides.values()].filter(Boolean).length;
  $("#c3dh").textContent = st.lay === "stack" && st.around ? "Stacked shows the close-ups only. Switch to Side by side to see the seabed around each one." : st.around && n < items.length ? `Cutting ${whole ? "the seabed" : st.around >= 1000 ? "1 km" : st.around + " m"} around each one, ${n} of ${items.length} ready` : whole ? "Same view, seabed filled in around each one out to its neighbours. Scroll out to see more. W A S D or arrows to move, Q E to turn." : st.around ? "Sharp close-up inside the ring, wider sonar around it. W A S D or arrows to move, Q E to turn, scroll to zoom." : "Drag to turn, W A S D or arrows to move, Q E to turn, scroll to zoom. Click a name to hide it, double-click to open it.";
  show3d({ canvas: $("#c3dc"), layer: $("#c3dl"), items, cols, hfs: st.hfs, cens: st.cen, stretch: st.stretch, label: st.ctx.label, tag: TAG, onOpen: st.ctx.open, stack: st.lay === "stack", match: st.mode === "match", reserve: st.map ? 396 : 0, wides: n === items.length && st.lay !== "stack" ? wides : null, lane: whole });
}

async function loadWide(items) {
  const span = spanOf();
  await Promise.all(items.filter((it) => !st.wide.has(it.id + "_" + span)).map(async (it) => {
    const r = await fetch(`/api/patch?id=${it.id}&span=${span}`, { cache: "no-store" }).catch(() => null);
    st.wide.set(it.id + "_" + span, r && r.ok ? await r.json() : null);
  }));
}

const MENU = ["Known wrecks", "New finds"];
function picker(items, cols) {
  const max = st.ctx.max || 8, full = items.length >= max, box = $("#cpick");
  const on = new Map(items.map((it, i) => [it.id, cols[i]]));
  const chip = (it) => `<button type="button" class="psel ${known(it) ? "kn" : "nw"}" data-id="${it.id}" title="Remove from compare"><i class="sw" style="background:${on.get(it.id)}"></i>${st.ctx.label(it)}<em>${Math.round(it.length_m)} m</em><b aria-hidden="true">×</b></button>`;
  const row = (it) => { const c = on.get(it.id); return `<label class="prow" data-q="${st.ctx.label(it).toLowerCase()}"><input type="checkbox" data-id="${it.id}"${c ? " checked" : ""}${!c && full ? " disabled" : ""}><i class="sw" style="${c ? `background:${c}` : ""}"></i><span>${st.ctx.label(it)}</span><em>${Math.round(it.length_m)} m</em></label>`; };
  const menu = ([title, list], g) => {
    const n = list.filter((it) => on.has(it.id)).length, open = st.pickOpen === g;
    return `<div class="pdd ${g ? "new" : "known"}"><button type="button" class="pbtn" data-g="${g}" aria-expanded="${open}">${MENU[g] || title}<em>${n} of ${list.length}</em><span class="car" aria-hidden="true"></span></button>${open ? `<div class="pmenu" role="dialog" aria-label="${title}"><p>${title}</p><div class="ptools"><input type="search" placeholder="Filter by name" value="${st.pickQ || ""}"><button type="button" class="pall" data-g="${g}" data-on="1">All</button><button type="button" class="pall" data-g="${g}" data-on="0">None</button></div><div class="prows">${list.map(row).join("")}</div>${full ? `<p class="pfull">${max} picked, the most at once. Untick one to add another.</p>` : ""}</div>` : ""}</div>`;
  };
  box.innerHTML = `<div class="psels">${items.map(chip).join("")}</div><div class="pdds">${(st.ctx.pool || []).map(menu).join("")}</div>`;
  const filter = () => { const q = (st.pickQ || "").toLowerCase(); box.querySelectorAll(".prow").forEach((r) => { r.hidden = !!q && !r.dataset.q.includes(q); }); };
  filter();
  const set = async (next) => { st.items = next.slice(0, max); await refresh(); };
  box.querySelectorAll(".psel").forEach((b) => b.addEventListener("click", () => set(st.ctx.toggle(b.dataset.id))));
  box.querySelectorAll(".prow input").forEach((c) => c.addEventListener("change", () => set(st.ctx.toggle(c.dataset.id))));
  box.querySelectorAll(".pbtn").forEach((b) => b.addEventListener("click", () => { st.pickOpen = st.pickOpen === +b.dataset.g ? null : +b.dataset.g; st.pickQ = ""; picker(st.items, colorsFor(st.items)); box.querySelector(".pmenu input")?.focus(); }));
  box.querySelectorAll(".pall").forEach((b) => b.addEventListener("click", () => {
    const list = st.ctx.pool[+b.dataset.g][1], want = b.dataset.on === "1";
    let cur = st.items;
    for (const it of list) if (cur.some((x) => x.id === it.id) !== want) cur = st.ctx.toggle(it.id);
    set(cur);
  }));
  const q = box.querySelector(".pmenu input");
  if (q) { q.addEventListener("input", () => { st.pickQ = q.value; filter(); }); if (document.activeElement === document.body) q.focus({ preventScroll: true }); }
  if (!box.dataset.bound) {
    box.dataset.bound = "1";
    box.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.pickOpen != null) { e.stopPropagation(); st.pickOpen = null; picker(st.items, colorsFor(st.items)); } });
    document.addEventListener("pointerdown", (e) => { if (st.pickOpen != null && !box.contains(e.target)) { st.pickOpen = null; picker(st.items, colorsFor(st.items)); } });
  }
}

function tiles(items, cols) {
  const box = $("#tiles");
  const n = items.length;
  box.style.setProperty("--tc", n <= 4 ? Math.max(n, 1) : n <= 8 ? 4 : 6);
  box.style.setProperty("--tr", n <= 4 ? 1 : 2);
  box.innerHTML = items.map((it, i) => `<button type="button" class="tile ${known(it) ? "kn" : "nw"}" data-id="${it.id}" style="--c:${cols[i]}"><span class="th"><i class="sw" style="background:${cols[i]}"></i><b>${st.ctx.label(it)}</b><span>${f1(it.length_m)} m by ${f1(it.height_m)} m</span></span><span class="tc"><canvas></canvas>${TAG(it)}<span class="tsb" hidden></span></span></button>`).join("");
  const maxL = Math.max(...items.map((i) => i.length_m || 40));
  box.querySelectorAll(".tile").forEach((el, i) => {
    el.addEventListener("click", () => st.ctx.open(items[i]));
    const wrap = el.querySelector(".tc"), cv = el.querySelector("canvas");
    const r = wrap.getBoundingClientRect();
    cv.width = Math.min(Math.round(r.width), 300);
    cv.height = Math.min(Math.round(r.height), 200);
    const it = items[i], hf = st.hfs.get(it.id);
    const span = (st.mode === "true" ? maxL * 1.18 : (it.length_m || 40) * 1.3) / st.zoom;
    const mpp = span / cv.width;
    paintField(cv, frame(hf, it, st.cen.get(it.id), mpp, cv.width, cv.height), mpp, 3, rgb(cols[i]));
    const sb = el.querySelector(".tsb");
    if (st.mode === "true") {
      const nl = [...NICE].reverse().find((v) => v / mpp <= cv.width * 0.4) || NICE[0];
      sb.hidden = false;
      sb.style.width = `${(nl / mpp / cv.width) * 100}%`;
      sb.dataset.t = `${nl} m`;
    }
  });
}

function stack(items, cols) {
  const cv = $("#stackc");
  const r = cv.parentElement.getBoundingClientRect();
  const W = Math.round(cv.clientWidth || r.width), H = Math.round(cv.clientHeight || 220);
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(31,78,107,.18)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  const maxL = Math.max(...items.map((i) => i.length_m || 40)), maxW = Math.max(...items.map((i) => i.width_m || 10));
  const trueMpp = Math.max((maxL * 1.15) / W, (maxW * 1.4) / H) / st.zoom;
  items.forEach((it, i) => {
    const hf = st.hfs.get(it.id), c = st.cen.get(it.id);
    const mpp = st.mode === "true" ? trueMpp : Math.max(((it.length_m || 40) * 1.15) / W, ((it.width_m || 10) * 1.4) / H) / st.zoom;
    const f = frame(hf, it, c, mpp, W, H);
    const top = Math.max(it.height_m || c.max, 0.3);
    ctx.strokeStyle = cols[i];
    ctx.lineJoin = "round";
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
    drawSegs(ctx, contourSegs(f, W, H, top * 0.15));
    ctx.setLineDash([]); ctx.lineWidth = LW(it, 2.2); ctx.globalAlpha = 1;
    drawSegs(ctx, contourSegs(f, W, H, top * 0.4));
  });
  if (st.mode === "true") {
    const nl = [...NICE].reverse().find((v) => v / trueMpp <= W * 0.3) || NICE[0];
    const w = nl / trueMpp;
    ctx.strokeStyle = "#13202A"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(10, H - 12); ctx.lineTo(10 + w, H - 12); ctx.moveTo(10, H - 16); ctx.lineTo(10, H - 8); ctx.moveTo(10 + w, H - 16); ctx.lineTo(10 + w, H - 8); ctx.stroke();
    ctx.fillStyle = "#13202A"; ctx.font = "italic 500 13px Newsreader, serif"; ctx.fillText(`${nl} m`, 14 + w, H - 8);
  } else {
    ctx.fillStyle = "#5B7482"; ctx.font = "400 11px 'Public Sans', sans-serif"; ctx.fillText("Each one scaled to the same length", 10, H - 8);
  }
  $("#clegend").innerHTML = legend(items, cols) + `<span class="note">Solid line: where it is 40% of its height. Dashed: where it begins to rise</span>`;
}

function legend(items, cols) {
  const grp = (k, name) => { const l = items.map((it, i) => [it, cols[i]]).filter(([it]) => known(it) === k); return l.length ? `<span class="lgrp ${k ? "known" : "new"}"><b>${name}</b>${l.map(([it, c]) => `<span><i class="sw" style="background:${c}"></i>${st.ctx.label(it)}</span>`).join("")}</span>` : ""; };
  return grp(false, "New finds") + grp(true, "Known wrecks");
}

function drawSegs(ctx, segs) {
  ctx.beginPath();
  for (const [a, b] of segs) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
}

function profiles(items, cols) {
  const svg = $("#profc");
  const W = svg.clientWidth || 600, H = svg.clientHeight || 180;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const ml = 44, mr = 12, mt = 10, mb = 22, pw = W - ml - mr, ph = H - mt - mb;
  const maxL = Math.max(...items.map((i) => i.length_m || 40));
  const half = (maxL * 1.15) / 2 / st.zoom;
  const maxH = Math.max(...items.map((i) => i.height_m || 1));
  const ppm = pw / (2 * half);
  let sy = st.stretch === 0 ? (ph * 0.9) / maxH : ppm * st.stretch;
  const clamped = maxH * sy > ph * 0.95;
  if (clamped) sy = (ph * 0.95) / maxH;
  const Y = (v) => mt + ph - v * sy;
  let out = "";
  const step = [1, 2, 5, 10, 20].find((s) => s * sy >= 18) || 20;
  for (let v = 0; v <= maxH * 1.12 && v * sy <= ph; v += step) out += `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(31,78,107,.16)"/><text x="${ml - 6}" y="${Y(v) + 4}" text-anchor="end">${v} m</text>`;
  if (st.mode === "true") {
    const t = [1, 2, 5, 10, 20, 50, 100].find((v) => half / v <= 3) || 100;
    for (let u = -Math.floor(half / t) * t; u <= half; u += t) out += `<line x1="${ml + (u + half) * ppm}" x2="${ml + (u + half) * ppm}" y1="${mt + ph}" y2="${mt + ph + 4}" stroke="#1F4E6B"/><text x="${ml + (u + half) * ppm}" y="${H - 6}" text-anchor="middle">${u} m</text>`;
  } else {
    [-50, 0, 50].forEach((p) => { const x = ml + (0.5 + p / 130) * pw; out += `<text x="${x}" y="${H - 6}" text-anchor="middle">${Math.round(p / st.zoom)}%</text>`; });
  }
  items.forEach((it, i) => {
    const hf = st.hfs.get(it.id), c = st.cen.get(it.id);
    const L = it.length_m || 40;
    const span = st.mode === "true" ? half : (L * 0.65) / st.zoom;
    const pts = profile(hf, it, c, span, Math.max(0.25, (st.mode === "true" ? 2 * half : 2 * span) / 260));
    const X = (u) => ml + (st.mode === "true" ? (u + half) * ppm : (0.5 + u / (2 * span)) * pw);
    out += `<polyline fill="none" stroke="${cols[i]}" stroke-width="${LW(it, 2)}" stroke-linejoin="round" points="${pts.map(([u, z]) => `${X(u).toFixed(1)},${Y(Math.max(z, -0.3)).toFixed(1)}`).join(" ")}"/>`;
  });
  svg.innerHTML = out;
  const sx = Math.round((sy / ppm) * 10) / 10;
  $("#plegend").innerHTML = legend(items, cols);
  $("#pnote").textContent = `${st.mode === "true" ? "Length in true metres" : "Each one scaled to the same length"}, height ${sx <= 1.05 ? "in true metres too" : "stretched " + sx + "x"}`;
}

function facts(items, cols) {
  const rows = items.map((it, i) => {
    const rv = st.ctx.verdictOf(it.id);
    return `<tr class="${known(it) ? "kn" : "nw"}"><td><i class="sw" style="background:${cols[i]}"></i>${st.ctx.label(it)}</td><td>${TAG(it)}${known(it) ? "" : ` <small class="cs">Claude: ${(CNAME[it.my_verdict] || "not looked at").toLowerCase()}</small>`}</td><td><i>${f1(it.length_m)}</i> m</td><td><i>${f1(it.width_m)}</i> m</td><td><i>${f1(it.height_m)}</i> m</td><td><i>${f1(it.depth_m)}</i> m</td><td><i>${f1(it.sharpness_x ?? 0)}</i>x</td><td><i>${f1(it.scour_m ?? 0)}</i> m</td><td><i>${sc(it.score)}</i></td><td>${rv ? rv[0].toUpperCase() + rv.slice(1) : "Not yet"}</td></tr>`;
  }).join("");
  $("#ctable").innerHTML = `<thead><tr><th></th><th>What it is</th><th>Length</th><th>Width</th><th>Height</th><th>Depth</th><th>Jaggedness</th><th>Scour</th><th>Score</th><th>You said</th></tr></thead><tbody>${rows}</tbody>`;
}
