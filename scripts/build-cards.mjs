import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || "playwright-core");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist"), CACHE = join(ROOT, "out/cards");
const DEF = "chesapeake_mouth", PER = Number(process.env.CARDS_PER_GROUP) || 10, FRESH = process.env.CARDS_FRESH === "1";
if (!existsSync(join(DIST, "api/areas.json"))) { console.error("run npm run build:public first"); process.exit(1); }

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((q, r) => {
  let f = join(DIST, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
  if (!f.startsWith(DIST) || !existsSync(f)) return r.writeHead(404).end();
  r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const mark = readFileSync(join(DIST, "brand/mark.svg"), "utf8");

const card = (it, areaName) => {
  const known = it.group === "charted";
  const name = known ? it.vessel?.name || (it.name && it.name !== "Unnamed wreck" ? it.name : "Charted wreck") : it.id;
  return `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@1,6..72,500&family=Public+Sans:wght@600;700;800&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;background:#13202A;font-family:"Public Sans",sans-serif;display:grid;grid-template-columns:540px 660px}
.l{padding:56px 48px;display:flex;flex-direction:column;justify-content:space-between;color:#fff}
.b{display:flex;align-items:center;gap:12px;font:600 22px "Public Sans";color:#D3E8F1}.b svg{width:40px;height:40px}
h1{font:800 62px/1.02 "Public Sans";letter-spacing:-.025em}h1 em{font-style:normal;color:#F07AB8}
.s{font:italic 500 40px Newsreader,serif;color:#A9CFE1}.s b{font:inherit;color:#fff}
.p{display:inline-block;font:700 18px "Public Sans";letter-spacing:.06em;text-transform:uppercase;padding:7px 14px;border-radius:99px;${known ? "background:#E3F1F0;color:#0B5F5E" : "background:#C2187F;color:#fff"}}
.a{font:600 20px "Public Sans";color:#A9CFE1;margin-top:14px}
.r{position:relative}canvas{width:660px;height:630px;display:block}
.t{position:absolute;left:20px;bottom:20px;font:600 20px "Public Sans";background:rgba(246,249,250,.94);color:#13202A;border-left:4px solid #A3197F;padding:8px 14px}
</style></head><body><div class="l"><div class="b">${mark}Wreck Hunt</div>
<div><h1>${known ? `${name}<br><em>a real wreck</em>` : `Is this a <em>shipwreck?</em>`}</h1>
<p class="s" style="margin-top:22px"><b>${Math.round(it.length_m)} m</b> long, <b>${Math.round(it.height_m * 10) / 10} m</b> tall</p></div>
<div><span class="p">${known ? "On the chart" : "On no chart"}</span><p class="a">${areaName}</p></div></div>
<div class="r"><canvas id="c" width="660" height="630"></canvas><span class="t">${it.id} in sonar, 160 m across</span></div>
<script type="module">import { paintThumb, loadHf } from "/lib.js"; const hf = await loadHf(${JSON.stringify({ heightfield: it.heightfield })}); if (hf) paintThumb(document.getElementById("c"), hf, 0.62); window.__done = !!hf;</script></body></html>`;
};

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(base + "/404.html");
let made = 0, kept = 0, failed = 0;
for (const a of JSON.parse(readFileSync(join(DIST, "api/areas.json"), "utf8"))) {
  const d = a.key === DEF ? join(DIST, "data") : join(DIST, "data", a.key);
  if (!existsSync(join(d, "all.json"))) continue;
  const all = JSON.parse(readFileSync(join(d, "all.json"), "utf8")), hunt = JSON.parse(readFileSync(join(d, "hunt.json"), "utf8"));
  const top = (f) => all.items.filter(f).sort((x, y) => y.score - x.score).slice(0, PER);
  const ids = new Set([...(hunt.leads || []).map((l) => l.all_id).filter(Boolean), ...top((i) => i.group === "charted").map((i) => i.id), ...top((i) => i.group !== "charted").map((i) => i.id)]);
  mkdirSync(join(CACHE, a.key), { recursive: true });
  for (const id of ids) {
    const it = all.items.find((i) => i.id === id), out = join(CACHE, a.key, `${id}.png`);
    if (!it?.heightfield) continue;
    if (!FRESH && existsSync(out)) { kept++; continue; }
    await page.setContent(card(it, a.name), { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__done !== undefined, null, { timeout: 15000 }).catch(() => {});
    if (!(await page.evaluate(() => window.__done))) { failed++; continue; }
    await page.screenshot({ path: out });
    made++;
  }
}
await b.close();
server.close();
console.log(`cards: ${made} made, ${kept} cached, ${failed} failed -> out/cards/ (npm run build:public copies them)`);
