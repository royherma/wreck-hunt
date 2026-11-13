import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { keyStep, useKeys } from "/keys3d.js";

const get = (u) => fetch(u, { cache: "no-store" }).then((r) => (r.ok ? r : null)).catch(() => null);
const area = () => encodeURIComponent(window.WH_AREA || "");
let V = null;
const whereOf = (id) => get("/api/where?id=" + id).then((r) => (r ? r.json() : null));
const DOT = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
})();

function init(host) {
  const canvas = document.createElement("canvas");
  canvas.id = "wsc";
  host.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(-1, 1.4, -0.8);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 2e6);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.48;
  controls.screenSpacePanning = false;
  controls.zoomSpeed = 1.3;
  const world = new THREE.Group();
  scene.add(world);
  V = { host, canvas, renderer, scene, camera, controls, world, on: false, patches: [], cups: [], area: null, labels: [], ex: 1 };
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  V.size = size;
  new ResizeObserver(size).observe(canvas);
  const v = new THREE.Vector3();
  useKeys(() => V.on);
  let last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const dt = Math.min(((now || performance.now()) - last) / 1000, 0.1); last = now || performance.now();
    if (!V.on || !V.geo) return;
    if (keyStep(camera, controls, dt, () => V.on)) V.fly = null;
    if (V.fly) {
      const t = Math.min((performance.now() - V.fly.t0) / 900, 1), e = t * t * (3 - 2 * t);
      controls.target.lerpVectors(V.fly.a, V.fly.b, e);
      camera.position.lerpVectors(V.fly.ca, V.fly.cb, e);
      if (t >= 1) V.fly = null;
    }
    controls.update();
    const d = camera.position.distanceTo(controls.target);
    V.ex = exAt(d);
    world.scale.y = V.ex;
    renderer.render(scene, camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const l of V.labels) {
      v.set(l.x, l.y * V.ex, l.z).project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      l.el.style.display = vis ? "" : "none";
      if (!vis) continue;
      const sx = ((v.x + 1) / 2) * w;
      let sy = ((1 - v.y) / 2) * h;
      for (const [ox, oz] of [[0, -l.hull], [0, l.hull], [-l.hull, 0], [l.hull, 0]]) {
        v.set(l.x + ox, l.y * V.ex, l.z + oz).project(camera);
        if (v.z < 1) sy = Math.min(sy, ((1 - v.y) / 2) * h);
      }
      l.el.style.transform = `translate(${sx}px, ${Math.max(sy, 14)}px) translate(-50%, calc(-100% - 8px))`;
    }
    const near = V.labels.reduce((b, l) => { const k = Math.hypot(l.x - controls.target.x, l.z - controls.target.z); return k < b[1] ? [l, k] : b; }, [null, Infinity]);
    const auto = near[0] && near[1] < Math.max(300, d * 0.6) && d < 8000 ? near[0] : null;
    if (auto !== V.off) { V.off = null; select(auto); }
    V.note(`${V.sel ? V.sel.name + " selected, " : ""}${d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(1) + " km"} away, height x${V.ex.toFixed(1)}${V.patches.length ? `, sharp sonar in ${V.patches.length} spot${V.patches.length > 1 ? "s" : ""}` : ""}. Click away to unselect, double-click the seabed for sharp sonar. W A S D or arrows to move, Q E to turn, Shift for faster.`);
  };
  requestAnimationFrame(tick);
  canvas.addEventListener("dblclick", (e) => { const p = pick(e, [V.terrain, ...V.patches.map((x) => x.mesh)]); if (p) sharpen(p.point); });
  canvas.addEventListener("pointermove", (e) => hover(e));
  let down = null;
  canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener("click", (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const m = pickPoint(e);
    if (m) return flyTo(m.x, m.y, m.z, 260, true);
    const p = pick(e, [V.terrain, ...V.patches.map((x) => x.mesh)]), q = p && V.world.worldToLocal(p.point.clone());
    if (V.sel && !(q && Math.hypot(q.x - V.sel.x, q.z - V.sel.z) < V.sel.r)) { V.off = V.sel; select(null); }
  });
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(e) {
  const b = V.canvas.getBoundingClientRect();
  ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
  ray.setFromCamera(ndc, V.camera);
}
function pick(e, objs) { setRay(e); return ray.intersectObjects(objs.filter(Boolean), false)[0] || null; }
function pickPoint(e) {
  setRay(e);
  ray.params.Points.threshold = V.camera.position.distanceTo(V.controls.target) * 0.012;
  const hit = ray.intersectObjects(V.pts.filter(Boolean), false)[0];
  return hit ? hit.object.userData.list[hit.index] : null;
}
function hover(e) {
  if (!V.pts) return;
  const m = pickPoint(e), tip = V.tip;
  if (!m) { tip.hidden = true; V.canvas.style.cursor = ""; return; }
  V.canvas.style.cursor = "pointer";
  const b = V.canvas.getBoundingClientRect();
  tip.hidden = false;
  tip.textContent = m.text;
  tip.style.transform = `translate(${e.clientX - b.left + 12}px, ${e.clientY - b.top + 12}px)`;
}

const exAt = (d) => (V.stretch ? V.stretch : Math.min(Math.max(d / 350, 3), V.exMax));
function flyTo(x, y, z, dist, sharp) {
  const b = new THREE.Vector3(x, y * exAt(dist), z);
  const off = V.camera.position.clone().sub(V.controls.target); off.y = 0; off.normalize().multiplyScalar(dist * Math.sin(0.9)); off.y = dist * Math.cos(0.9);
  V.fly = { t0: performance.now(), a: V.controls.target.clone(), b, ca: V.camera.position.clone(), cb: b.clone().add(off) };
  if (sharp) sharpen(V.world.localToWorld(new THREE.Vector3(x, y, z)), 300);
}

const C = [[0.66, 0.81, 0.88], [0.83, 0.91, 0.95], [0.55, 0.73, 0.82], [0.29, 0.51, 0.64], [0.12, 0.31, 0.42]];
const mixc = (a, b, t) => a.map((v, q) => v + (b[q] - v) * Math.min(Math.max(t, 0), 1));
function surface(pos, idx, hs) {
  const col = new Float32Array(hs.length * 3);
  for (let k = 0; k < hs.length; k++) {
    const h = hs[k], cc = h < 0 ? mixc(C[1], C[0], -h / 0.9) : h < 1.2 ? mixc(C[1], C[2], h / 1.2) : h < 3 ? mixc(C[2], C[3], (h - 1.2) / 1.8) : mixc(C[3], C[4], (h - 3) / 3);
    col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { mesh: new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), base: col.slice() };
}

function closeup(l, hf) {
  const n = hf.w, c = hf.cell_m, pos = new Float32Array(n * n * 3), idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3;
    pos[o] = l.x + (i - (n - 1) / 2) * c; pos[o + 1] = l.y - 0.7 + hf.z[j * n + i]; pos[o + 2] = l.z + (j - (n - 1) / 2) * c;
    if (i < n - 1 && j < n - 1) { const a = j * n + i, b = a + 1, cc = a + n, dd = cc + 1; idx.push(a, cc, b, b, cc, dd); }
  }
  const hs = Float32Array.from(hf.z), { mesh, base } = surface(pos, idx, hs);
  mesh.renderOrder = 2;
  V.world.add(mesh);
  V.cups.push({ mesh, hs, base });
}

async function sharpen(worldPt, force) {
  const p = V.world.worldToLocal(worldPt.clone());
  const lat = V.lat0 - p.z / V.ky, lon = V.lon0 + p.x / V.kx;
  const d = V.camera.position.distanceTo(V.controls.target);
  const span = force || (d < 1500 ? 300 : d < 6000 ? 1000 : 3000);
  const key = `${lat.toFixed(4)},${lon.toFixed(4)},${span}`;
  if (V.patches.some((x) => x.key === key)) return;
  V.note(`Loading ${span >= 1000 ? span / 1000 + " km" : span + " m"} of sharp sonar here...`);
  const r = await get(`/api/patchat?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&span=${span}`);
  if (!r) return;
  const hf = await r.json();
  const n = hf.w, c = hf.cell_m, pos = new Float32Array(n * n * 3), idx = [];
  const valid = hf.z.filter((v) => v != null), pm = valid.reduce((x, y) => x + y, 0) / Math.max(valid.length, 1);
  let tm = 0, tn = 0;
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) {
    const la = lat + ((j - 4) / 8) * (hf.h * c) / V.ky, lo = lon + ((i - 4) / 8) * (hf.w * c) / V.kx, t = V.depthAt(la, lo);
    if (t) { tm += t; tn++; }
  }
  const lift = (tn ? tm / tn : 0) + (pm - V.dmean) + 0.4;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3, zv = hf.z[j * n + i];
    pos[o] = p.x + (i - (n - 1) / 2) * c; pos[o + 1] = zv == null ? 0 : -(zv - V.dmean) + lift; pos[o + 2] = p.z + (j - (n - 1) / 2) * c;
  }
  const ok = (k) => hf.z[k] != null;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, cc = a + n, dd = cc + 1;
    if (ok(a) && ok(b) && ok(cc) && ok(dd)) idx.push(a, cc, b, b, cc, dd);
  }
  const sorted = valid.slice().sort((x, y) => x - y), med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const hs = Float32Array.from(hf.z, (v) => (v == null ? 0 : med - v));
  const { mesh, base: col } = surface(pos, idx, hs);
  mesh.material.polygonOffset = true; mesh.material.polygonOffsetFactor = 2; mesh.material.polygonOffsetUnits = 2;
  mesh.renderOrder = 1;
  V.world.add(mesh);
  V.patches.push({ key, mesh, hs, base: col });
  paint();
  while (V.patches.length > 10) { const o = V.patches.shift(); V.world.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
}

async function loadArea() {
  const key = window.WH_AREA || "";
  if (V.area === key) return true;
  V.area = key;
  for (const o of V.world.children.slice()) V.world.remove(o);
  V.patches = []; V.geo = null;
  const [sj, zb, mp] = await Promise.all([get("/api/sonar"), get("/api/sonar/z"), get("/api/map")]);
  if (!sj || !zb) { V.note("No whole-scan sonar for this area yet"); return false; }
  const S = await sj.json(), Z = new Float32Array(await zb.arrayBuffer()), map = mp ? await mp.json() : { known: [], leads: [] };
  const [w0, s0, e0, n0] = S.bounds, [zw0, zs0, ze0, zn0] = S.zb;
  V.lat0 = (s0 + n0) / 2; V.lon0 = (w0 + e0) / 2;
  V.kx = 111320 * Math.cos((V.lat0 * Math.PI) / 180); V.ky = 110540;
  const X = (lon) => (lon - V.lon0) * V.kx, Zc = (lat) => -(lat - V.lat0) * V.ky;
  const fin = Z.filter((v) => Number.isFinite(v));
  V.dmean = fin.reduce((a, b) => a + b, 0) / Math.max(fin.length, 1);
  const span = Math.max(X(e0) - X(w0), Zc(s0) - Zc(n0));
  V.exMax = Math.max(3, (0.05 * span) / Math.max(S.depth_m[1] - S.depth_m[0], 2));
  const nx = S.zw, ny = S.zh, pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, lon = zw0 + ((i + 0.5) / nx) * (ze0 - zw0), lat = zn0 - ((j + 0.5) / ny) * (zn0 - zs0), d = Z[k];
    pos[k * 3] = X(lon); pos[k * 3 + 1] = Number.isFinite(d) ? -(d - V.dmean) : 0; pos[k * 3 + 2] = Zc(lat);
    uv[k * 2] = (lon - w0) / (e0 - w0); uv[k * 2 + 1] = (lat - s0) / (n0 - s0);
  }
  const ok = (k) => Number.isFinite(Z[k]);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (ok(a) || ok(b) || ok(c) || ok(d)) idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tex = await new THREE.TextureLoader().loadAsync(`/api/sonar/img?area=${area()}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  V.terrain = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }));
  V.world.add(V.terrain);
  V.geo = { X, Zc, Z, nx, ny, zb: S.zb, span };
  V.depthAt = (lat, lon) => {
    const i = Math.round(((lon - zw0) / (ze0 - zw0)) * nx - 0.5), j = Math.round(((zn0 - lat) / (zn0 - zs0)) * ny - 0.5);
    const d = i >= 0 && j >= 0 && i < nx && j < ny ? Z[j * nx + i] : NaN;
    return Number.isFinite(d) ? -(d - V.dmean) : 0;
  };
  const pts = (list, color, size) => {
    const arr = new Float32Array(list.length * 3);
    list.forEach((m, k) => { arr[k * 3] = m.x; arr[k * 3 + 1] = m.y + 0.5; arr[k * 3 + 2] = m.z; });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const p = new THREE.Points(pg, new THREE.PointsMaterial({ color, size, map: DOT, alphaTest: 0.4, sizeAttenuation: false, depthTest: false, transparent: true }));
    p.renderOrder = 5;
    p.userData.list = list;
    V.world.add(p);
    return p;
  };
  const at = (lat, lon, text) => ({ x: X(lon), y: V.depthAt(lat, lon), z: Zc(lat), text });
  const kw = (map.known || []).filter((k) => k[2] === "charted wreck").map(([la, lo, , name, cat]) => at(la, lo, `${name || "Charted wreck"}${cat ? ", " + cat : ""}`));
  const ko = (map.known || []).filter((k) => k[2] !== "charted wreck").map(([la, lo, kind, name]) => at(la, lo, `${name || kind}`));
  const ld = (map.leads || []).map((l) => ({ ...at(l.lat, l.lon, `${l.id}${l.short ? " (" + l.short + ")" : ""}, ${Math.round(l.length_m)} m long, ${l.height_m} m tall${l.verdict ? ", Claude: " + l.verdict : ""}`), id: l.id }));
  V.pts = [pts(ko, 0x8aa0ad, 5), pts(kw, 0x2e4a62, 8), pts(ld, 0xd6469f, 8)];
  const d0 = span / 2 / Math.tan((35 * Math.PI) / 360) * 0.9;
  V.controls.target.set(0, 0, 0);
  V.camera.position.set(0, d0 * Math.cos(0.85), d0 * Math.sin(0.85));
  V.controls.maxDistance = d0 * 3;
  V.controls.minDistance = 20;
  return true;
}

function select(l) {
  if (V.sel === l) return;
  V.sel = l;
  for (const q of V.labels) q.el.classList.toggle("sel", q === l);
  paint();
}

function bright(css) {
  const c = new THREE.Color(css), h = {};
  c.getHSL(h);
  return c.setHSL(h.h, Math.max(h.s, 0.6), Math.max(h.l, 0.55)).toArray();
}

function paint() {
  const l = V.sel;
  for (const pt of [...V.patches, ...V.cups]) {
    const a = pt.mesh.geometry.attributes.color, pos = pt.mesh.geometry.attributes.position.array;
    a.array.set(pt.base);
    if (l) for (let k = 0; k < pt.hs.length; k++) {
      if (pt.hs[k] < 0.5 || Math.hypot(pos[k * 3] - l.x, pos[k * 3 + 2] - l.z) > l.hull) continue;
      for (let c = 0; c < 3; c++) a.array[k * 3 + c] += (l.col[c] - a.array[k * 3 + c]) * 0.85;
    }
    a.needsUpdate = true;
  }
}

export function hideWhole() {
  if (V) { V.on = false; V.host.hidden = true; }
}

export async function showWhole({ host, items, cols, label, onOpen, stretch, note, hfs }) {
  if (!V) init(host);
  V.host.hidden = false;
  V.on = true;
  V.note = note;
  V.stretch = stretch;
  V.size();
  if (!V.tip) { V.tip = document.createElement("div"); V.tip.className = "wtip"; V.tip.hidden = true; host.append(V.tip); }
  if (!(await loadArea())) return;
  const sig = items.map((x) => x.id).join(",") + cols.join(",");
  if (sig === V.sig) return;
  V.sig = sig;
  for (const l of V.labels) l.el.remove();
  for (const o of V.cups || []) { V.world.remove(o.mesh); o.mesh.geometry.dispose(); o.mesh.material.dispose(); }
  V.cups = [];
  V.labels = []; V.sel = null; V.off = null;
  const spots = await Promise.all(items.map((it) => whereOf(it.id)));
  items.forEach((it, i) => {
    const s = spots[i];
    if (!s?.ok) return;
    const x = V.geo.X(s.lon), z = V.geo.Zc(s.lat), y = V.depthAt(s.lat, s.lon);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "wl" + (it.group === "charted" ? " kn" : " nw");
    el.innerHTML = `<i class="sw" style="background:${cols[i]}"></i>${label(it)}`;
    el.title = "Click to fly there, double-click to open";
    el.style.setProperty("--c", cols[i]);
    el.addEventListener("click", () => { V.off = null; select(V.labels.find((l) => l.el === el)); flyTo(x, y, z, 220, true); });
    el.addEventListener("dblclick", () => onOpen(it));
    host.append(el);
    const r = Math.max((it.length_m || 40) / 2 + 25, 50);
    V.labels.push({ el, x, y: y + 1, z, s, name: label(it), r, hull: (it.length_m || 40) / 2 + 12, col: bright(cols[i]) });
    if (hfs?.get(it.id)) closeup(V.labels.at(-1), hfs.get(it.id));
  });
  const L = V.labels;
  if (!L.length) return;
  const km = (p, q) => Math.hypot(p.x - q.x, p.z - q.z) / 1000;
  for (const l of L) {
    const o = L.filter((q) => q !== l).sort((p, q) => km(l, p) - km(l, q))[0];
    if (o) l.el.insertAdjacentHTML("beforeend", `<em class="wkm">${km(l, o) < 10 ? km(l, o).toFixed(1) : Math.round(km(l, o))} km to ${o.name}</em>`);
  }
  const xs = L.map((l) => l.x), zs = L.map((l) => l.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1500) * 1.35;
  const d = ext / 2 / Math.tan((35 * Math.PI) / 360);
  V.fly = null;
  V.controls.target.set(cx, 0, cz);
  V.camera.position.set(cx, d * Math.cos(0.85), cz + d * Math.sin(0.85));
  for (const l of L) sharpen(V.world.localToWorld(new THREE.Vector3(l.x, l.y, l.z)), 1000);
}
