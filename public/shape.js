import { bilinear, ramp, loadHf } from "/lib.js";

const NS = 48;

export function centreOf(hf) {
  const { w, h, z } = hf;
  let max = -1e9;
  for (let k = 0; k < z.length; k++) if (z[k] > max) max = z[k];
  const t = max * 0.4;
  let sx = 0, sy = 0, sw = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const v = z[j * w + i];
    if (v > t) { sx += i * v; sy += j * v; sw += v; }
  }
  return { cx: sw ? sx / sw : (w - 1) / 2, cy: sw ? sy / sw : (h - 1) / 2, max };
}

export function frame(hf, item, c, mpp, W, H, flip) {
  const cell = hf.cell_m || 4;
  const th = ((item.heading_deg || 0) * Math.PI) / 180;
  const dx = Math.sin(th), dy = -Math.cos(th), qx = -dy, qy = dx;
  const out = new Float32Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let u = (px - W / 2 + 0.5) * mpp;
    const v = (py - H / 2 + 0.5) * mpp;
    if (flip) u = -u;
    out[py * W + px] = bilinear(hf, c.cx + (u * dx + v * qx) / cell, c.cy + (u * dy + v * qy) / cell);
  }
  return out;
}

export function paintField(canvas, f, mpp, exag = 3, tint = [163, 25, 127]) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(W, H);
  const L = [-0.55, 0.7, -0.45], ln = Math.hypot(...L);
  const at = (x, y) => f[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = f[y * W + x];
    const gx = ((at(x + 1, y) - at(x - 1, y)) * exag) / (2 * mpp);
    const gy = ((at(x, y + 1) - at(x, y - 1)) * exag) / (2 * mpp);
    const nl = Math.hypot(gx, 1, gy);
    const d = (-gx * L[0] + L[1] - gy * L[2]) / (nl * ln);
    const shade = Math.min(Math.max(0.58 + 0.5 * d, 0.35), 1.2);
    let [r, g, b] = ramp(h).map((v) => v * shade);
    if (h > 0.35) {
      const c = h / 0.5;
      const dist = (Math.abs(c - Math.round(c)) * 0.5) / Math.max(Math.hypot(gx, gy) * mpp * 0.25 + 0.25, 0.25);
      const m = Math.max(0, 1 - dist / 0.5) * 0.7;
      r += (tint[0] - r) * m; g += (tint[1] - g) * m; b += (tint[2] - b) * m;
    }
    const o = (y * W + x) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

const EDGE = [[0, 0, 1, 0], [1, 0, 1, 1], [0, 1, 1, 1], [0, 0, 0, 1]];
const TABLE = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[0, 3]], 8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };

export function contourSegs(f, W, H, k) {
  const segs = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = f[j * W + i], b = f[j * W + i + 1], c = f[(j + 1) * W + i + 1], d = f[(j + 1) * W + i];
    const idx = (a > k ? 8 : 0) + (b > k ? 4 : 0) + (c > k ? 2 : 0) + (d > k ? 1 : 0);
    const t = TABLE[idx];
    if (!t) continue;
    const pt = (e) => {
      const [x0, y0, x1, y1] = EDGE[e];
      const v0 = [a, b, d, a][e], v1 = [b, c, c, d][e];
      const s = (k - v0) / (v1 - v0);
      return [i + x0 + (x1 - x0) * s, j + y0 + (y1 - y0) * s];
    };
    for (const [p, q] of t) segs.push([pt(p), pt(q)]);
  }
  return segs;
}

export function profile(hf, item, c, half, step = 1) {
  const cell = hf.cell_m || 4;
  const th = ((item.heading_deg || 0) * Math.PI) / 180;
  const dx = Math.sin(th), dy = -Math.cos(th), qx = -dy, qy = dx;
  const spread = Math.max((item.width_m || 10) / 4, cell);
  const pts = [];
  for (let s = -half; s <= half; s += step) {
    let best = -9;
    for (let o = -spread; o <= spread; o += cell / 2) best = Math.max(best, bilinear(hf, c.cx + (s * dx + o * qx) / cell, c.cy + (s * dy + o * qy) / cell));
    pts.push([s, best]);
  }
  return pts;
}

function norm(arr) {
  let m = 0;
  for (const v of arr) m += v;
  m /= arr.length;
  let n = 0;
  const out = new Float32Array(arr.length);
  for (let k = 0; k < arr.length; k++) { out[k] = arr[k] - m; n += out[k] * out[k]; }
  n = Math.sqrt(n) || 1;
  for (let k = 0; k < out.length; k++) out[k] /= n;
  return out;
}

function desc(hf, item, mpp, c) {
  const H = Math.max(item.height_m || hf.max || 1, 0.3);
  const mk = (flip) => {
    const fr = frame(hf, item, c, mpp, NS, NS, flip);
    const m = new Uint8Array(fr.length);
    fr.forEach((v, k) => { m[k] = v / H >= 0.35 ? 1 : 0; });
    return { v: norm(Array.from(fr, (v) => { const t = v / H; return t < 0.18 ? 0 : Math.min(t, 1); })), m };
  };
  const a = mk(false), f = mk(true);
  return { a: a.v, f: f.v, ma: a.m, mf: f.m };
}

export function descriptors(hf, item) {
  const c = centreOf(hf);
  return { true: desc(hf, item, 3, c), shape: desc(hf, item, Math.max(item.length_m || 40, 8) / 36, c), L: item.length_m, H: item.height_m };
}

const dot = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

export function similarity(da, db, mode) {
  const key = mode === "shape" ? "shape" : "true";
  const A = da[key], B = db[key];
  const iou = (x, y) => { let i = 0, u = 0; for (let k = 0; k < x.length; k++) { i += x[k] & y[k]; u += x[k] | y[k]; } return u ? i / u : 0; };
  const r = Math.max(0.5 * dot(A.a, B.a) + 0.5 * iou(A.ma, B.ma), 0.5 * dot(A.a, B.f) + 0.5 * iou(A.ma, B.mf));
  let s = r;
  if (mode !== "shape") s -= 0.15 * Math.abs(Math.log(da.L / db.L)) + 0.1 * Math.abs(Math.log(da.H / db.H));
  return Math.max(0, Math.min(1, s));
}

export async function buildAll(items, loader, onProgress) {
  const out = new Map();
  let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const it = items[next++];
      const hf = await loader(it);
      if (hf) out.set(it.id, descriptors(hf, it));
      onProgress?.(++done, items.length);
      if (done % 8 === 0) await new Promise((r) => setTimeout(r));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}
export { loadHf };
