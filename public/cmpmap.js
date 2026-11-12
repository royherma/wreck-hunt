const spots = new Map();
let base = null, sonar = null, loaded = false;
const M = { el: null, items: [], cols: [], label: null, view: null, key: "", opt: { sonar: true, fade: 0.85, wrecks: true, others: false, lines: true } };

const get = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const km = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const area = () => encodeURIComponent(window.WH_AREA || "");

async function load() {
  if (loaded) return;
  loaded = true;
  [base, sonar] = await Promise.all([get("/api/map"), get("/api/sonar")]);
  base = base || { known: [], leads: [] };
}

function geo() {
  const b = sonar?.bounds;
  const pts = M.items.map((it) => spots.get(it.id)).filter((s) => s?.ok);
  const lat0 = b ? (b[1] + b[3]) / 2 : pts.reduce((a, p) => a + p.lat, 0) / Math.max(pts.length, 1);
  const lon0 = b ? (b[0] + b[2]) / 2 : pts.reduce((a, p) => a + p.lon, 0) / Math.max(pts.length, 1);
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  return { P: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * ky], kx, ky };
}

function fit(which) {
  const { P } = geo();
  M.lastFit = which;
  const box = M.el.querySelector("svg").getBoundingClientRect();
  let xy;
  if (which === "all" && sonar) xy = [P(sonar.bounds[1], sonar.bounds[0]), P(sonar.bounds[3], sonar.bounds[2])];
  else xy = M.items.map((it) => spots.get(it.id)).filter((s) => s?.ok).map((s) => P(s.lat, s.lon));
  if (!xy.length) return;
  const x0 = Math.min(...xy.map((q) => q[0])), x1 = Math.max(...xy.map((q) => q[0])), y0 = Math.min(...xy.map((q) => q[1])), y1 = Math.max(...xy.map((q) => q[1]));
  const W = box.width || 340, H = box.height || 220;
  M.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, mpp: Math.max((x1 - x0) / (W - 50), (y1 - y0) / (H - 40), 1500 / W) * 1.08 };
  draw();
}

function draw() {
  const svg = M.el.querySelector("svg");
  if (!svg || !M.view) return;
  const { P, kx, ky } = geo();
  const W = svg.clientWidth || 340, H = svg.clientHeight || 220, v = M.view, o = M.opt;
  const S = ([x, y]) => [W / 2 + (x - v.cx) / v.mpp, H / 2 + (y - v.cy) / v.mpp];
  const inside = ([x, y]) => x > -10 && y > -10 && x < W + 10 && y < H + 10;
  let out = "";
  if (o.sonar && sonar) {
    const [ax, ay] = S(P(sonar.bounds[3], sonar.bounds[0])), [bx, by] = S(P(sonar.bounds[1], sonar.bounds[2]));
    out += `<image href="/api/sonar/img?area=${area()}" x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}" preserveAspectRatio="none" opacity="${o.fade}"/>`;
  }
  if (o.wrecks) for (const [la, lo, kind] of base.known || []) {
    const q = S(P(la, lo));
    if (!inside(q)) continue;
    out += kind === "charted wreck" ? `<rect x="${q[0] - 2.5}" y="${q[1] - 2.5}" width="5" height="5" transform="rotate(45 ${q[0]} ${q[1]})" class="kw"/>` : `<circle cx="${q[0]}" cy="${q[1]}" r="1.8" class="ko"/>`;
  }
  const mine = new Set(M.items.map((x) => x.id));
  if (o.others) for (const l of base.leads || []) {
    if (mine.has(l.id)) continue;
    const q = S(P(l.lat, l.lon));
    if (inside(q)) out += `<circle cx="${q[0]}" cy="${q[1]}" r="2.6" class="oc"><title>${l.id}, ${Math.round(l.length_m)} m</title></circle>`;
  }
  const pts = M.items.map((it, i) => ({ it, c: M.cols[i], s: spots.get(it.id) })).filter((p) => p.s?.ok);
  if (o.lines) for (const n of pts.filter((p) => p.it.group !== "charted")) for (const p of pts) {
    if (p === n) continue;
    const [ax, ay] = S(P(n.s.lat, n.s.lon)), [bx, by] = S(P(p.s.lat, p.s.lon));
    const d = Math.hypot((n.s.lon - p.s.lon) * kx, (n.s.lat - p.s.lat) * ky);
    out += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" class="dl"/>` + (Math.hypot(bx - ax, by - ay) > 60 ? `<text x="${ax + (bx - ax) * 0.4}" y="${ay + (by - ay) * 0.4 - 4}" class="dt">${km(d)}</text>` : "");
  }
  for (const p of pts) {
    const [sx, sy] = S(P(p.s.lat, p.s.lon));
    const nw = p.it.group !== "charted", r = sx > W * 0.62;
    out += `<circle cx="${sx}" cy="${sy}" r="${nw ? 6 : 5}" fill="${p.c}" class="${nw ? "pn" : "pk"}"/><text x="${r ? sx - 9 : sx + 9}" y="${sy + 4}" text-anchor="${r ? "end" : "start"}" class="pl">${M.label(p.it)}</text>`;
  }
  const bar = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].reverse().find((m) => m / v.mpp <= W * 0.3) || 50;
  out += `<line x1="10" y1="${H - 10}" x2="${10 + bar / v.mpp}" y2="${H - 10}" class="sb"/><text x="${14 + bar / v.mpp}" y="${H - 6}" class="dt" text-anchor="start">${km(bar)}</text>`;
  svg.innerHTML = out;
}

function shell() {
  const o = M.opt, ck = (k, t) => `<label><input type="checkbox" data-k="${k}"${o[k] ? " checked" : ""}>${t}</label>`;
  M.el.innerHTML = `<div class="mh">Where they are <span>private, this Mac only</span><button type="button" class="mbig">${M.el.classList.contains("big") ? "Smaller" : "Bigger"}</button></div>
<div class="mopt">${ck("sonar", "Sonar scan")}<input type="range" min="0.15" max="1" step="0.05" value="${o.fade}" data-k="fade" title="Sonar fade">${ck("wrecks", "Charted")}${ck("others", "Other close-ups")}${ck("lines", "Distances")}<span class="grow"></span><button type="button" data-fit="these">These</button><button type="button" data-fit="all">Whole scan</button></div>
<svg></svg><div class="mk"><i class="kwk"></i>wreck <i class="kok"></i>obstruction <i class="ock"></i>close-up${sonar ? `<span>sonar ${sonar.km2.toLocaleString("en-US")} km², ${Math.round(sonar.depth_m[0])}-${Math.round(sonar.depth_m[1])} m deep</span>` : `<span>no sonar picture for this area yet</span>`}</div>`;
  M.el.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", () => { o[c.dataset.k] = c.checked; draw(); }));
  M.el.querySelector("input[type=range]").addEventListener("input", (e) => { o.fade = +e.target.value; draw(); });
  M.el.querySelectorAll("[data-fit]").forEach((b) => b.addEventListener("click", () => fit(b.dataset.fit)));
  M.el.querySelector(".mbig").addEventListener("click", () => { M.el.classList.toggle("big"); shell(); requestAnimationFrame(() => fit(M.lastFit || "these")); });
  const svg = M.el.querySelector("svg");
  svg.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    const b = svg.getBoundingClientRect(), v = M.view, f = Math.exp(e.deltaY * 0.0022);
    const ox = e.clientX - b.left - b.width / 2, oy = e.clientY - b.top - b.height / 2;
    const mx = v.cx + ox * v.mpp, my = v.cy + oy * v.mpp;
    v.mpp = Math.min(Math.max(v.mpp * f, 2), 2000);
    v.cx = mx - ox * v.mpp; v.cy = my - oy * v.mpp;
    draw();
  }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: M.view.cx, cy: M.view.cy }; svg.setPointerCapture(e.pointerId); e.stopPropagation(); });
  svg.addEventListener("pointermove", (e) => { if (!drag) return; M.view.cx = drag.cx - (e.clientX - drag.x) * M.view.mpp; M.view.cy = drag.cy - (e.clientY - drag.y) * M.view.mpp; draw(); });
  svg.addEventListener("pointerup", () => { drag = null; });
}

export async function drawMap(el, items, cols, label) {
  M.el = el; M.items = items; M.cols = cols; M.label = label;
  await load();
  await Promise.all(items.filter((it) => !spots.has(it.id)).map(async (it) => spots.set(it.id, await get("/api/where?id=" + it.id))));
  const key = items.map((x) => x.id).join(",");
  if (!el.querySelector("svg")) shell();
  if (key !== M.key || !M.view) { M.key = key; requestAnimationFrame(() => fit("these")); }
  else draw();
}
