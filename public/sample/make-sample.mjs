import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, "hf"), { recursive: true });

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const N = 64, CELL = 4;
const r1 = (x) => Math.round(x * 10) / 10;
const smooth = (t) => t * t * (3 - 2 * t);

function seabed(i, j, ripple) {
  const x = j * CELL, y = i * CELL;
  const ang = ripple.ang;
  const u = x * Math.cos(ang) + y * Math.sin(ang);
  return Math.sin(u / ripple.wl * Math.PI * 2) * ripple.amp + (rnd() - 0.5) * 0.09;
}

function build(spec, ripple) {
  const z = new Array(N * N).fill(0);
  const c = N / 2 * CELL;
  const th = (spec.heading * Math.PI) / 180;
  const cs = Math.cos(th), sn = Math.sin(th);
  const blobs = spec.blobs || [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = j * CELL - c, y = i * CELL - c;
    let v = seabed(i, j, ripple);
    const u = x * sn + -y * cs;
    const w = x * cs + y * sn;
    if (spec.kind === "ship") {
      const hl = spec.length / 2, hw = spec.width / 2;
      const t = Math.abs(u) / hl;
      if (t < 1) {
        const half = hw * Math.pow(1 - Math.pow(t, 3.4), 0.5);
        const edge = Math.abs(w) / Math.max(half, 0.1);
        if (edge < 1) {
          let h = spec.height * (1 - Math.pow(edge, 7)) * (0.9 + 0.1 * Math.cos(t * 2.4)) * (1 - 0.45 * Math.pow(t, 3));
          const sinceBow = (u / hl + 1) / 2;
          if (sinceBow > spec.breakAt[0] && sinceBow < spec.breakAt[1]) {
            const m = smooth(1 - Math.abs((sinceBow - (spec.breakAt[0] + spec.breakAt[1]) / 2) / ((spec.breakAt[1] - spec.breakAt[0]) / 2)));
            h *= 1 - 0.7 * m + (rnd() - 0.5) * 0.25 * m;
          }
          if (sinceBow > 0.06 && sinceBow < 0.2 && Math.abs(w) < hw * 0.5) h += spec.height * 0.28 * (1 - Math.abs(w) / (hw * 0.5));
          v += Math.max(h, 0);
        }
      }
      const dEdge = Math.max(0, Math.hypot(Math.max(Math.abs(u) - hl, 0), Math.max(Math.abs(w) - hw * 0.8, 0)));
      v -= 0.65 * Math.exp(-dEdge / 7) * (Math.abs(u) < hl * 1.05 ? 1 : 0.5) * (Math.abs(w) > hw * 0.7 || Math.abs(u) > hl ? 1 : 0.2);
    }
    for (const b of blobs) {
      const bx = b.x * 1, by = b.y * 1;
      const du = (x - bx), dv = (y - by);
      const bu = du * Math.cos(b.rot || 0) + dv * Math.sin(b.rot || 0);
      const bv = -du * Math.sin(b.rot || 0) + dv * Math.cos(b.rot || 0);
      const q = (bu * bu) / (b.a * b.a) + (bv * bv) / (b.b * b.b);
      v += b.h * Math.exp(-Math.pow(q, b.sharp || 1) * 1.4);
    }
    z[i * N + j] = v;
  }
  return z;
}

function metrics(z) {
  let max = -9, maxSlope = 0;
  for (let i = 1; i < N - 1; i++) for (let j = 1; j < N - 1; j++) {
    const v = z[i * N + j];
    if (v > max) max = v;
    const gx = (z[i * N + j + 1] - z[i * N + j - 1]) / (2 * CELL);
    const gy = (z[(i + 1) * N + j] - z[(i - 1) * N + j]) / (2 * CELL);
    maxSlope = Math.max(maxSlope, Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI);
  }
  return { height: max, slope: maxSlope };
}

const shipBlobs = (n, spread) => Array.from({ length: n }, () => ({ x: (rnd() - 0.5) * spread, y: (rnd() - 0.5) * spread, a: 2 + rnd() * 3, b: 2 + rnd() * 3, h: 0.3 + rnd() * 0.7, rot: rnd() * 3 }));

const defs = [
  { id: "L01", kind: "ship", length: 71, width: 14.2, height: 5.9, heading: 38, depth: 14.6, year: 2016, charted: 2.1, breakAt: [0.62, 0.8], blobs: shipBlobs(5, 110), solid: 0.8, alone: 160, flat: 0.2, headline: "Long narrow hull, 6 m tall, sharp ends", broken: "one end looks broken up" },
  { id: "L02", kind: "ship", length: 58, width: 11.5, height: 4.6, heading: 112, depth: 19.3, year: 2012, charted: 3.4, breakAt: [0.3, 0.46], blobs: shipBlobs(4, 100), solid: 0.9, alone: 140, flat: 0.25, headline: "Hull with a collapsed middle section", broken: "the middle is caved in" },
  { id: "L03", kind: "ship", length: 84, width: 15.8, height: 4.1, heading: 164, depth: 22.8, year: 2019, charted: 1.7, breakAt: [0.5, 0.66], blobs: shipBlobs(6, 120), solid: 0.7, alone: 110, flat: 0.3, headline: "Big hull lying on its side", broken: "debris sits close by" },
  { id: "L04", kind: "ship", length: 46, width: 9.8, height: 3.7, heading: 71, depth: 11.9, year: 2008, charted: 4.8, breakAt: [0.7, 0.85], blobs: shipBlobs(3, 90), solid: 0.85, alone: 150, flat: 0.35, headline: "Small steel hull with a raised stern", broken: "height is under 4 m" },
  { id: "L05", kind: "ship", length: 63, width: 12.7, height: 3.2, heading: 8, depth: 25.1, year: 2021, charted: 2.9, breakAt: [0.2, 0.4], blobs: shipBlobs(5, 110), solid: 0.6, alone: 90, flat: 0.3, headline: "Low hull, scattered along its length", broken: "the outline is patchy" },
  { id: "L06", kind: "ship", length: 52, width: 10.4, height: 2.6, heading: 139, depth: 17.4, year: 2016, charted: 6.2, breakAt: [0.45, 0.6], blobs: shipBlobs(7, 120), solid: 0.65, alone: 70, flat: 0.4, headline: "Hull-shaped, but low and rough", broken: "low height and other bumps nearby" },
  { id: "L07", kind: "blob", length: 34, width: 18, height: 3.4, heading: 90, depth: 21.5, year: 2012, charted: 5.1, blobs: [{ x: 0, y: 0, a: 17, b: 9, h: 3.4, rot: 0.5, sharp: 1.2 }, { x: 18, y: 12, a: 6, b: 5, h: 1.5 }, { x: -12, y: -9, a: 5, b: 4, h: 1.1 }], solid: 0.7, alone: 80, flat: 0.35, headline: "Lumpy mound, fat for its length", broken: "width is half its length" },
  { id: "L08", kind: "rock", length: 28, width: 22, height: 2.8, heading: 0, depth: 16.2, year: 2004, charted: 7.4, blobs: [{ x: 0, y: 0, a: 9, b: 8, h: 2.8, sharp: 0.9 }, { x: 10, y: -6, a: 6, b: 5, h: 2.2 }, { x: -8, y: 8, a: 6, b: 6, h: 1.9 }, { x: 4, y: 12, a: 4, b: 4, h: 1.6 }, { x: -14, y: -4, a: 4, b: 5, h: 1.2 }], solid: 0.55, alone: 60, flat: 0.4, headline: "Rock pile with several peaks", broken: "no hull outline at all" },
  { id: "L09", kind: "crest", length: 74, width: 16, height: 2.1, heading: 55, depth: 12.8, year: 2019, charted: 3.6, blobs: [{ x: 0, y: 0, a: 38, b: 8, h: 2.1, rot: -0.97, sharp: 1.5 }], solid: 0.9, alone: 100, flat: 0.25, headline: "Smooth ridge, probably a sand wave", broken: "slopes are too gentle for steel" },
  { id: "L10", kind: "rock", length: 40, width: 31, height: 1.9, heading: 0, depth: 28.4, year: 2021, charted: 8.9, blobs: [{ x: 0, y: 0, a: 15, b: 12, h: 1.9, sharp: 0.8 }, { x: -9, y: 9, a: 6, b: 6, h: 1.2 }, { x: 14, y: 7, a: 5, b: 7, h: 1.4 }, { x: 6, y: -14, a: 6, b: 4, h: 1.0 }], solid: 0.5, alone: 40, flat: 0.45, headline: "Broad spread of boulders", broken: "wide, low and cluttered" },
  { id: "L11", kind: "blob", length: 24, width: 21, height: 1.6, heading: 0, depth: 18.7, year: 2008, charted: 4.0, blobs: [{ x: 0, y: 0, a: 11, b: 10, h: 1.6, sharp: 1 }], solid: 0.95, alone: 120, flat: 0.3, headline: "Round hump, no ship shape", broken: "it is round, not long" },
  { id: "L12", kind: "crest", length: 90, width: 26, height: 1.3, heading: 120, depth: 23.9, year: 2012, charted: 9.8, blobs: [{ x: 0, y: 0, a: 45, b: 13, h: 1.3, rot: -2.09, sharp: 1.8 }], solid: 0.8, alone: 90, flat: 0.5, headline: "Long low swell in the sand", broken: "barely rises above the sand" },
];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ratioScore = (L, W) => { const r = L / W; return r >= 4 ? 1 : r >= 3 ? 0.7 : r >= 2 ? 0.4 : 0.1; };

function lead(def, charted) {
  const ripple = { ang: rnd() * 3, wl: 14 + rnd() * 10, amp: 0.09 + rnd() * 0.07 };
  const z = build(def.kind === "ship" ? def : { ...def, kind: def.kind }, ripple);
  const m = metrics(z);
  const height = r1(m.height), slope = Math.round(clamp(m.slope, 8, 62));
  const ratio = (def.length / def.width);
  const parts = [
    { name: "Height off seabed", value: r1(clamp(height / 4, 0, 1) * 3), max: 3, why: `${height} m, full marks at 4 m+` },
    { name: "Steep sides", value: r1(clamp(slope / 40, 0, 1) * 2), max: 2, why: `${slope}° max slope` },
    { name: "Flat seabed around it", value: r1(clamp(1 - (def.flat - 0.2) / 0.35, 0, 1) * 2), max: 2, why: `background bumps ${def.flat < 0.3 ? "under 0.3 m" : "up to " + def.flat + " m"}` },
    { name: "Stands alone", value: r1(clamp(def.alone / 150, 0, 1) * 2), max: 2, why: `${def.alone >= 150 ? "no other bumps within 160 m" : "other bumps within " + def.alone + " m"}` },
    { name: "Solid outline", value: r1(def.solid), max: 1, why: `solidity ${def.solid}` },
    { name: "Ship proportions", value: ratioScore(def.length, def.width), max: 1, why: `${r1(ratio)}:1 length to width` },
  ];
  const score = r1(parts.reduce((s, p) => s + p.value, 0));
  const worst = [...parts].sort((a, b) => (b.max - b.value) - (a.max - a.value))[0];
  const reasons = { "Height off seabed": "it stands under 4 m", "Steep sides": "the sides slope gently", "Flat seabed around it": "ripples and rocks around it add noise", "Stands alone": "other bumps sit close by", "Solid outline": "the outline is broken up", "Ship proportions": "it is not long and narrow" };
  const lost = r1(worst.max - worst.value);
  const out = {
    id: def.id, verdict: charted ? "charted" : score >= 7.5 ? "ship-like" : score >= 5 ? "maybe" : "unlikely",
    headline: def.headline,
    depth_m: def.depth, length_m: def.length, width_m: def.width, height_m: height, heading_deg: def.heading,
    max_slope_deg: slope, nearest_charted_km: charted ? 0 : def.charted, survey_year: def.year,
    score, score_max: 11, score_parts: parts,
    pulled_down: lost > 0 ? `${worst.name} lost ${lost}: ${reasons[worst.name]}` : "Nothing lost",
    heightfield: `/sample/hf/${def.id}.json`,
  };
  writeFileSync(join(here, "hf", `${def.id}.json`), JSON.stringify({ w: N, h: N, cell_m: CELL, z: z.map((v) => Math.round(v * 100) / 100) }));
  return out;
}

const leads = defs.map((d) => lead(d, false)).sort((a, b) => b.score - a.score).map((l, i) => ({ ...l, rank: i + 1 }));

const knownDefs = [
  { id: "K01", kind: "ship", length: 78, width: 13.5, height: 6.8, heading: 25, depth: 16.1, year: 2016, breakAt: [0.55, 0.7], blobs: shipBlobs(3, 90), solid: 0.9, alone: 150, flat: 0.2, headline: "Charted steamer, found again" },
  { id: "K02", kind: "ship", length: 62, width: 12, height: 5.1, heading: 101, depth: 20.4, year: 2012, breakAt: [0.3, 0.42], blobs: shipBlobs(3, 90), solid: 0.85, alone: 150, flat: 0.2, headline: "Charted freighter, found again" },
  { id: "K03", kind: "ship", length: 49, width: 10.1, height: 4.4, heading: 148, depth: 13.2, year: 2019, breakAt: [0.6, 0.72], blobs: shipBlobs(2, 80), solid: 0.9, alone: 150, flat: 0.2, headline: "Charted tug, found again" },
  { id: "K04", kind: "ship", length: 92, width: 16.4, height: 7.4, heading: 63, depth: 24.7, year: 2021, breakAt: [0.45, 0.58], blobs: shipBlobs(4, 100), solid: 0.9, alone: 150, flat: 0.2, headline: "Charted tanker, found again" },
  { id: "K05", kind: "ship", length: 55, width: 11, height: 4.9, heading: 5, depth: 18.1, year: 2008, breakAt: [0.2, 0.34], blobs: shipBlobs(3, 90), solid: 0.88, alone: 150, flat: 0.2, headline: "Charted schooner, found again" },
];
const known = knownDefs.map((d, i) => ({ ...lead(d, true), rank: i + 1, name: "charted wreck", headline: d.headline }));

const hunt = {
  sample: true,
  generated_at: "2026-11-11T10:40:00+07:00",
  area: { name: "Chesapeake Bay mouth, Virginia", seabed_km2: 5483, sonar_km2: 2440, tiles: 116, surveys: 31, survey_years: [2004, 2024] },
  funnel: [
    { stage: "Seabed mapped by sonar", count: 2440, unit: "km²" },
    { stage: "Ship-sized bumps found", count: 3011, unit: "bumps" },
    { stage: "Not on any chart", count: 2719, unit: "bumps" },
    { stage: "Shaped like a ship", count: 41, unit: "bumps" },
    { stage: "Shortlisted after a look", count: 12, unit: "leads" },
  ],
  charted_score_median: [...known.map((k) => k.score)].sort((a, b) => a - b)[Math.floor(known.length / 2)],
  recall: { charted_wrecks_visible: 143, found: 104, note: "Charted wrecks the scanner re-found, proof it can see wrecks" },
  leads, known,
};

const cells = new Set();
const cellFor = () => {
  for (;;) {
    const x = 32.5 + 5 * Math.floor(rnd() * 9), y = 7.5 + 5 * Math.floor(rnd() * 16);
    if (!cells.has(x + "," + y)) { cells.add(x + "," + y); return [x, y]; }
  }
};
const compass = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
const whereOf = ([x, y]) => {
  const dx = x - 11, dy = y - 37;
  const d = Math.max(5, Math.round(Math.hypot(dx, dy) / 5) * 5);
  const dir = compass[Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 / 45) % 8];
  return { x_km: x, y_km: y, cell_km: 5, text: `about ${d} km ${dir} of Cape Henry` };
};
[...leads, ...known].forEach((it) => { it.where = whereOf(cellFor()); });

const cats = ["dangerous wreck", "hull showing", "wreck, depth known", "dangerous wreck", "wreck, depth unknown"];
known.forEach((k, i) => {
  k.chart_category = cats[i];
  k.chart_note = i === 0 ? "Reported by a pilot, position approximate" : i === 3 ? "Foul ground, fishing gear snags" : null;
  k.charted_year = [1964, null, 1987, 1951, 2003][i];
  k.vessel = i === 1 ? { name: "Example steamer", sunk: 1918, story: "Lost in a storm while carrying coal." } : null;
});

hunt.progress = {
  state: "running", updated_at: "2026-11-11T11:08:00+07:00", eta_min: 4,
  steps: [
    { name: "Map the seabed", state: "done", done: 116, total: 116, unit: "tiles" },
    { name: "Find bumps", state: "done", done: 116, total: 116, unit: "tiles" },
    { name: "Check the chart", state: "done", done: 3011, total: 3011, unit: "bumps" },
    { name: "Check the shape", state: "done", done: 2719, total: 2719, unit: "bumps" },
    { name: "Close-up look", state: "running", done: 558, total: 600, unit: "bumps" },
    { name: "Rank the leads", state: "todo", done: 0, total: 12, unit: "leads" },
  ],
};
hunt.map = {
  w_km: 80, h_km: 89,
  locator: { lon: -76, lat: 37 },
  land: [
    [[0, 89], [18, 89], [22, 78], [17, 66], [10, 58], [3, 53], [0, 52]],
    [[0, 0], [0, 36], [6, 38], [11, 37], [16, 30], [21, 22], [25, 12], [31, 0]],
  ],
  places: [{ name: "Cape Charles", x: 5, y: 56 }, { name: "Cape Henry", x: 12, y: 40 }, { name: "Virginia Beach", x: 3, y: 18 }],
  sonar: [[[28, 10], [76, 10], [76, 50], [28, 50]], [[30, 58], [70, 58], [70, 82], [30, 82]]],
};
writeFileSync(join(here, "hunt.json"), JSON.stringify(hunt, null, 1));
console.log(leads.map((l) => `${l.rank} ${l.id} ${l.verdict} ${l.score} h${l.height_m} s${l.max_slope_deg}`).join("\n"));
