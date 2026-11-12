import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const $ = (s) => document.querySelector(s);
export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const fmt = (n) => Number(n).toLocaleString("en-US");
export const f1 = (n) => (Math.round(n * 10) / 10).toString();
export const sc = (n) => Number(n).toFixed(1);
export const G = 128;
export const EXAG = 3;
export const VERDICT = { "ship-like": "Ship-like", maybe: "Maybe", unlikely: "Unlikely", charted: "Charted" };

export const params = new URLSearchParams(location.search);
export const want = params.get("data");

export async function fetchJson(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function loadHunt(want) {
  const real = await fetchJson("/data/hunt.json");
  const realExists = !!real;
  if (want !== "sample" && real) return { data: real, mode: "real", realExists: true };
  const sample = await fetchJson("/sample/hunt.json");
  if (!sample) throw new Error("no hunt data");
  return { data: sample, mode: "sample", realExists };
}


export const hfCache = new Map();
export function loadHf(item) {
  if (!item.heightfield) return Promise.resolve(null);
  if (!hfCache.has(item.heightfield)) {
    hfCache.set(item.heightfield, fetch(item.heightfield).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return hfCache.get(item.heightfield);
}

export function bilinear(hf, x, y) {
  const { w, h, z } = hf;
  x = Math.min(Math.max(x, 0), w - 1.001);
  y = Math.min(Math.max(y, 0), h - 1.001);
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const a = z[j * w + i], b = z[j * w + i + 1], c = z[(j + 1) * w + i], d = z[(j + 1) * w + i + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export function resample(hf) {
  const out = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    out[j * G + i] = bilinear(hf, (i / (G - 1)) * (hf.w - 1), (j / (G - 1)) * (hf.h - 1));
  }
  return out;
}

export const STOPS = [
  [-0.9, [169, 207, 225]],
  [0, [211, 232, 241]],
  [1.2, [141, 185, 208]],
  [3, [74, 130, 163]],
  [6, [31, 78, 107]],
];
export function ramp(h) {
  if (h <= STOPS[0][0]) return STOPS[0][1];
  for (let k = 1; k < STOPS.length; k++) {
    if (h <= STOPS[k][0]) {
      const [h0, c0] = STOPS[k - 1], [h1, c1] = STOPS[k];
      const t = (h - h0) / (h1 - h0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function paintThumb(canvas, hf, crop = 0.62) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const cell = hf.cell_m || 4;
  const span = Math.min(160 / cell, hf.w - 2);
  const spanY = Math.min(span * (H / W), hf.h - 2);
  const cx = (hf.w - 1) / 2, cy = (hf.h - 1) / 2;
  const L = [-0.55, 0.7, -0.45];
  const ln = Math.hypot(...L);
  const sample = (px, py) => bilinear(hf, cx - span / 2 + (px / W) * span, cy - spanY / 2 + (py / H) * spanY);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const h = sample(px, py);
    const e = span / W;
    const gx = ((sample(px + 1, py) - sample(px - 1, py)) * EXAG) / (2 * e * cell);
    const gy = ((sample(px, py + 1) - sample(px, py - 1)) * EXAG) / (2 * e * cell);
    const nl = Math.hypot(gx, 1, gy);
    const d = (-gx * L[0] + 1 * L[1] + -gy * L[2]) / (nl * ln);
    const shade = Math.min(Math.max(0.58 + 0.5 * d, 0.35), 1.2);
    let [r, g, b] = ramp(h).map((c) => c * shade);
    if (h > 0.35) {
      const c = h / 0.5;
      const dist = Math.abs(c - Math.round(c)) * 0.5 / Math.max(Math.hypot(gx, gy) * e * cell * 0.5 + 0.25, 0.25);
      const m = Math.max(0, 1 - dist / 0.5) * 0.7;
      r += (163 - r) * m; g += (25 - g) * m; b += (127 - b) * m;
    }
    const o = (py * W + px) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function thumbFor(item, w, h, crop) {
  const wrap = document.createElement("span");
  wrap.className = "thumb";
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const draw = () => loadHf(item).then((hf) => hf && paintThumb(canvas, hf, crop));
  if (item.chip) {
    const img = new Image();
    img.alt = "";
    img.onerror = () => { img.remove(); wrap.append(canvas); draw(); };
    img.src = item.chip;
    wrap.append(img);
  } else { wrap.append(canvas); draw(); }
  return wrap;
}

export function contourBackdrop() {
  const cv = $("#bg");
  const draw = () => {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = 8, cols = Math.ceil(w / cs) + 2, rows = Math.ceil(h / cs) + 2;
    const f = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = i * cs / 420, y = j * cs / 420;
      f[j * cols + i] = Math.sin(x * 1.3 + Math.sin(y * 1.7) * 1.4) + Math.sin(y * 1.1 - x * .6 + 1.7) * .8 + Math.sin((x + y) * 2.1) * .35 + Math.sin(x * 3.1 - y * 2.3) * .18;
    }
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const E = [[0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 1], [0, 0, 0, 1]];
    const table = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[0, 3]], 8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
    for (let k = -2.4; k < 2.5; k += 0.3) {
      const major = Math.abs(Math.round(k / 0.3)) % 4 === 0;
      ctx.strokeStyle = major ? "rgba(31,78,107,.2)" : "rgba(31,78,107,.1)";
      ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i], b = f[j * cols + i + 1], c = f[(j + 1) * cols + i + 1], d = f[(j + 1) * cols + i];
        const idx = (a > k ? 8 : 0) + (b > k ? 4 : 0) + (c > k ? 2 : 0) + (d > k ? 1 : 0);
        const segs = table[idx];
        if (!segs) continue;
        const pt = (e) => {
          const [x0, y0, x1, y1] = E[e];
          const v0 = [a, b, d, a][e === 0 ? 0 : e === 1 ? 1 : e === 2 ? 2 : 3];
          const v1 = [b, c, c, d][e];
          const t = (k - v0) / (v1 - v0);
          return [(i + x0 + (x1 - x0) * t) * cs, (j + y0 + (y1 - y0) * t) * cs];
        };
        for (const [p, q] of segs) {
          const A = pt(p), B = pt(q);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
      }
      ctx.stroke();
    }
  };
  let t;
  addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
  draw();
}

export const VERT = `
uniform sampler2D uA; uniform sampler2D uB;
uniform float uMix, uEx, uSize;
varying vec3 vN; varying float vH; varying vec3 vP;
float hgt(vec2 uv){ return mix(texture2D(uA, uv).r, texture2D(uB, uv).r, uMix); }
void main(){
  float G = ${G}.0;
  vec2 g = position.xz + 0.5;
  vec2 uv = (g * (G - 1.0) + 0.5) / G;
  float e = 1.0 / G;
  float h = hgt(uv);
  float hl = hgt(uv - vec2(e, 0.0)), hr = hgt(uv + vec2(e, 0.0));
  float hd = hgt(uv - vec2(0.0, e)), hu = hgt(uv + vec2(0.0, e));
  float texel = uSize / G;
  vN = normalize(vec3(-(hr - hl) * uEx / (2.0 * texel), 1.0, -(hu - hd) * uEx / (2.0 * texel)));
  vH = h;
  vec3 p = vec3(position.x * uSize, h * uEx, position.z * uSize);
  vP = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const FRAG = `
uniform float uSweep, uSize, uR0;
varying vec3 vN; varying float vH; varying vec3 vP;
vec3 ramp(float h){
  vec3 c0 = vec3(0.663, 0.812, 0.882);
  vec3 c1 = vec3(0.827, 0.910, 0.945);
  vec3 c2 = vec3(0.553, 0.725, 0.816);
  vec3 c3 = vec3(0.290, 0.510, 0.639);
  vec3 c4 = vec3(0.122, 0.306, 0.420);
  if (h < 0.0) return mix(c1, c0, clamp(-h / 0.9, 0.0, 1.0));
  if (h < 1.2) return mix(c1, c2, h / 1.2);
  if (h < 3.0) return mix(c2, c3, (h - 1.2) / 1.8);
  return mix(c3, c4, clamp((h - 3.0) / 3.0, 0.0, 1.0));
}
void main(){
  float r = length(vP.xz) / (uSize * 0.5);
  float fade = 1.0 - smoothstep(uR0, min(uR0 + 0.43, 1.0), r);
  if (fade <= 0.001) discard;
  vec3 L = normalize(vec3(-0.55, 0.7, -0.45));
  float d = dot(normalize(vN), L);
  float shade = clamp(0.58 + 0.5 * d, 0.35, 1.2);
  vec3 col = ramp(vH) * shade;
  float c = vH / 0.5;
  float w = fwidth(c);
  float line = 1.0 - smoothstep(0.0, w * 1.5, abs(fract(c - 0.5) - 0.5));
  float on = smoothstep(0.3, 0.55, vH);
  col = mix(col, vec3(0.639, 0.098, 0.498), line * on * 0.9);
  float a = fade;
  if (uSweep < 1.5) {
    float t = vP.z / uSize + 0.5;
    float front = uSweep * 1.4 - (1.0 - t) ;
    if (front < 0.0) discard;
    float band = 1.0 - smoothstep(0.0, 0.035, front);
    float scan = 0.5 + 0.5 * sin(vP.x * 2.4);
    float k = 1.0 - smoothstep(0.0, 0.3, front);
    col = mix(col, vec3(0.122, 0.306, 0.420), k * scan * 0.35);
    col = mix(col, vec3(0.639, 0.098, 0.498), band * 0.85);
  }
  gl_FragColor = vec4(col, a);
}`;

export function makeViewer() {
  const canvas = $("#gl");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(27, 1, 1, 3000);
  camera.position.set(66, 78, 106);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 4, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.38;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.keyPan = false;
  controls.enableZoom = false;
  controls.minDistance = 6;
  controls.maxDistance = 3000;
  controls.autoRotate = !reduce;
  controls.autoRotateSpeed = 0.7;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  const mkTex = (arr) => {
    const t = new THREE.DataTexture(arr, G, G, THREE.RedFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  let dataA = new Float32Array(G * G), dataB = new Float32Array(G * G);
  const texA = mkTex(dataA), texB = mkTex(dataB);
  const uniforms = {
    uA: { value: texA }, uB: { value: texB }, uMix: { value: 1 }, uEx: { value: EXAG },
    uSize: { value: 256 }, uR0: { value: 0.55 }, uSweep: { value: reduce ? 2 : -1 },
  };
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(G * G * 3), idx = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const o = (j * G + i) * 3;
    pos[o] = i / (G - 1) - 0.5; pos[o + 1] = 0; pos[o + 2] = j / (G - 1) - 0.5;
    if (i < G - 1 && j < G - 1) {
      const a = j * G + i, b = a + 1, c = a + G, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let paused = false;
  let morph = null, turn = null, ex = EXAG, fit = null, fitDist = 148, zoomT = 148, obj = null;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const k = e.ctrlKey ? 0.012 : 0.0016;
    const unit = e.deltaMode === 1 ? 16 : 1;
    zoomT = Math.min(Math.max(zoomT * Math.exp(e.deltaY * unit * k), fitDist / 8), fitDist * 4);
  }, { passive: false });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), HOME = new THREE.Vector3(0, 4, 0);
  let glide = null;
  canvas.addEventListener("dblclick", (e) => {
    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit) return;
    const lim = uniforms.uSize.value / 2;
    hit.set(Math.min(Math.max(hit.x, -lim), lim), HOME.y, Math.min(Math.max(hit.z, -lim), lim));
    controls.autoRotate = false;
    glide = { t0: performance.now(), from: controls.target.clone(), to: hit };
    zoomT = Math.max(zoomT * 0.6, fitDist / 8);
  });
  const state = { sweepStart: 0 };
  const tick = (now) => {
    if (glide) {
      const t = reduce ? 1 : Math.min((now - glide.t0) / 600, 1), e = t * t * (3 - 2 * t);
      const next = glide.from.clone().lerp(glide.to, e), d = next.clone().sub(controls.target);
      controls.target.copy(next); camera.position.add(d);
      if (t >= 1) glide = null;
    }
    if (morph) {
      const t = Math.min((now - morph.t0) / 750, 1);
      uniforms.uMix.value = t * t * (3 - 2 * t);
      if (t >= 1) morph = null;
    }
    if (turn) {
      const t = Math.min((now - turn.t0) / 1100, 1);
      const e = t * t * (3 - 2 * t);
      const th = turn.from + turn.delta * e;
      const r = turn.r + (turn.rTo - turn.r) * e;
      camera.position.set(controls.target.x + Math.sin(th) * r, turn.y + (turn.yTo - turn.y) * e, controls.target.z + Math.cos(th) * r);
      if (t >= 1) turn = null;
      zoomT = Math.hypot(camera.position.x - controls.target.x, camera.position.y - controls.target.y, camera.position.z - controls.target.z);
    } else {
      const off = camera.position.clone().sub(controls.target);
      const dist = off.length();
      if (Math.abs(zoomT - dist) > 0.05) camera.position.copy(controls.target).add(off.multiplyScalar((dist + (zoomT - dist) * (reduce ? 1 : 0.16)) / dist));
    }
    if (state.sweepStart && uniforms.uSweep.value < 1.5) {
      const t = (now - state.sweepStart) / 2400;
      uniforms.uSweep.value = t >= 1 ? 2 : t * 1.0;
    }
    controls.update();
    if (!paused) renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return {
    face(heading, length, force) {
      fit = { heading, length };
      { const L = obj || length || 70; fitDist = Math.min(Math.max(L < 70 ? 62 + (L - 13) * 1.5 : 148 + (L - 70) * 2.4, 62), 440); }
      zoomT = Math.min(Math.max(zoomT, fitDist / 8), fitDist * 4);
      if (force) { glide = { t0: performance.now(), from: controls.target.clone(), to: HOME.clone() }; zoomT = fitDist; }
      if (!controls.autoRotate && !force) return;
      const off = camera.position.clone().sub(controls.target);
      const h = (heading * Math.PI) / 180;
      const want = Math.atan2(Math.cos(h), Math.sin(h)) + 0.55;
      const from = Math.atan2(off.x, off.z);
      let d = ((want - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(d) > Math.PI / 2) d = ((want + Math.PI - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const q = fitDist / off.length();
      const r = Math.hypot(off.x, off.z);
      const polar = force ? 0.95 : null;
      const yTo = polar ? fitDist * Math.cos(polar) + controls.target.y : off.y * q + controls.target.y;
      const rTo = polar ? fitDist * Math.sin(polar) : r * q;
      turn = { t0: performance.now(), from, delta: d, r, rTo, y: camera.position.y, yTo };
      if (reduce) turn.t0 = -1e9;
    },
    pause(v) { paused = v; },
    refit() { if (fit) this.face(fit.heading, fit.length, true); },
    zoomBy(f) { zoomT = Math.min(Math.max(zoomT * f, fitDist / 8), fitDist * 4); },
    set(hf, first, item) {
      const next = resample(hf);
      obj = hf.obj_m || null;
      if (controls.target.distanceTo(HOME) > 0.5) glide = { t0: performance.now(), from: controls.target.clone(), to: HOME.clone() };
      const len = obj || item?.length_m || 70, hh = item?.height_m || 3;
      uniforms.uEx.value = Math.min(Math.max(14 / hh, 3), 6);
      uniforms.uR0.value = Math.min(Math.max((len * 0.8) / (Math.max(hf.w, hf.h) * (hf.cell_m || 4) / 2), 0.5), 0.88);
      ex = uniforms.uEx.value;
      uniforms.uSize.value = Math.max(hf.w, hf.h) * (hf.cell_m || 4);
      if (first) {
        dataB.set(next); dataA.set(next);
        texA.needsUpdate = texB.needsUpdate = true;
        uniforms.uMix.value = 1;
        return;
      }
      const m = uniforms.uMix.value;
      for (let k = 0; k < dataA.length; k++) dataA[k] = dataA[k] * (1 - m) + dataB[k] * m;
      dataB.set(next);
      texA.needsUpdate = texB.needsUpdate = true;
      uniforms.uMix.value = reduce ? 1 : 0;
      morph = reduce ? null : { t0: performance.now() };
      if (!reduce) { const t = performance.now(); morph.t0 = t; }
    },
    startSweep() { if (!reduce) { uniforms.uSweep.value = 0; state.sweepStart = performance.now(); } },
  };
}

export function drawProfile(item, hf) {
  const svg = $("#prof");
  const W = svg.clientWidth || 600, H = svg.clientHeight || 110;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (!hf) { svg.innerHTML = ""; return; }
  const cell = hf.cell_m || 4;
  const th = ((item.heading_deg || 0) * Math.PI) / 180;
  const dx = Math.sin(th), dy = -Math.cos(th);
  const px = -dy, py = dx;
  const half = (item.length_m || 60) / 2 + 32;
  const spread = Math.max((item.width_m || 10) / 3, cell);
  const cx = hf.ax ?? (hf.w - 1) / 2, cy = hf.ay ?? (hf.h - 1) / 2;
  const pts = [];
  for (let s = -half; s <= half; s += 1) {
    let best = -9;
    for (let o = -spread; o <= spread; o += cell / 2) {
      const gx = cx + (s * dx + o * px) / cell, gy = cy + (s * dy + o * py) / cell;
      best = Math.max(best, bilinear(hf, gx, gy));
    }
    pts.push([s, best]);
  }
  const depth = item.depth_m || 15;
  const peak = Math.max(...pts.map((p) => p[1]));
  const trough = Math.min(...pts.map((p) => p[1]), 0);
  const dTop = depth - peak - 1, dBot = depth - trough + 1.2;
  const mL = 54, mR = 14, mT = 12, mB = 22;
  const X = (s) => mL + ((s + half) / (2 * half)) * (W - mL - mR);
  const Y = (d) => mT + ((d - dTop) / (dBot - dTop)) * (H - mT - mB);
  let out = "";
  const step = dBot - dTop > 12 ? 4 : dBot - dTop > 6 ? 2 : 1;
  for (let d = Math.ceil(dTop / step) * step; d <= dBot; d += step) {
    out += `<line x1="${mL}" x2="${W - mR}" y1="${Y(d)}" y2="${Y(d)}" stroke="rgba(31,78,107,.16)" stroke-width="1"/><text x="${mL - 7}" y="${Y(d) + 4}" text-anchor="end">${d} m</text>`;
  }
  out += ``;
  const area = pts.map((p) => `${X(p[0]).toFixed(1)},${Y(depth - p[1]).toFixed(1)}`);
  out += `<polygon points="${X(pts[0][0])},${Y(dBot)} ${area.join(" ")} ${X(pts[pts.length - 1][0])},${Y(dBot)}" fill="rgba(31,78,107,.14)"/>`;
  const base = pts.map((p) => [X(p[0]), Y(depth - p[1])]);
  out += `<polyline points="${area.join(" ")}" fill="none" stroke="#A3197F" stroke-width="1.8" stroke-linejoin="round"/>`;
  const L = item.length_m || 0;
  if (L) {
    const y = H - mB + 7;
    out += `<path d="M${X(-L / 2)} ${y - 4}V${y}H${X(L / 2)}V${y - 4}" fill="none" stroke="#1F4E6B" stroke-width="1"/>`;
    out += `<text x="${(X(-L / 2) + X(L / 2)) / 2}" y="${y + 11}" text-anchor="middle">${f1(L)} m along the hull axis</text>`;
  }
  const top = pts.reduce((a, p) => (p[1] > a[1] ? p : a), pts[0]);
  const tx = X(top[0]), ty = Y(depth - top[1]);
  out += `<circle cx="${tx}" cy="${ty}" r="3" fill="#A3197F"/>`;
  const anchor = tx > W * 0.7 ? "end" : "start", off = tx > W * 0.7 ? -9 : 9;
  out += `<text x="${tx + off}" y="${anchor === "end" ? ty + 4 : ty < 18 ? ty + 14 : ty - 2}" text-anchor="${anchor}">${f1(depth - top[1])} m deep at the top</text>`;
  out += `<text class="sans" x="${W - mR}" y="${Y(depth) + 14}" text-anchor="end">Seabed ${f1(depth)} m</text>`;
  svg.innerHTML = out;
}

