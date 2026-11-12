import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, watch, readdirSync, mkdirSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

const ROOT = new URL(".", import.meta.url).pathname;
const PORT = Number(process.env.PORT) || 5027;
const DIRS = { "/data/": join(ROOT, "out/web/"), "/": join(ROOT, "public/") };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml" };
const RELOAD = `<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>`;
const DEF = "chesapeake_mouth";
const areaOf = (req) => {
  const a = new URL(req.url, "http://x").searchParams.get("area") || DEF;
  return /^[a-z_]+$/.test(a) && existsSync(join(ROOT, "out", a)) ? a : DEF;
};
const webDir = (a) => join(ROOT, "out/web/", a === DEF ? "" : a + "/");
const verdictFile = (a) => join(ROOT, "out", a, "roy_check.json");
const readVerdicts = (a) => (existsSync(verdictFile(a)) ? JSON.parse(readFileSync(verdictFile(a), "utf8")) : {});
const listAreas = () => [DEF, ...readdirSync(join(ROOT, "out/web"), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ROOT, "out/web", d.name, "hunt.json"))).map((d) => d.name)]
  .filter((key) => existsSync(join(webDir(key), "hunt.json")))
  .map((key) => {
    const h = JSON.parse(readFileSync(join(webDir(key), "hunt.json"), "utf8")), L = h.leads || [];
    const n = (v) => L.filter((l) => l.verdict === v).length;
    return { key, name: h.area?.name || key, source: h.area?.source || "NOAA", km2: h.funnel?.[0]?.count ?? h.area?.sonar_km2 ?? null, closeups: h.funnel?.[3]?.count ?? null,
      leads: L.length, shiplike: n("ship-like"), maybe: n("maybe"), started: statSync(join(ROOT, "out", key)).birthtime.toISOString(), finished: h.generated_at || null };
  }).sort((a, b) => a.started.localeCompare(b.started));
const dirSize = (d) => { let n = 0; try { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); n += e.isDirectory() ? dirSize(f) : statSync(f).size; } } catch {} return n; };
const lines = (f) => { try { return readFileSync(f, "utf8").trim().split("\n").length - 1; } catch { return 0; } };
const count = (d, ext) => { try { return readdirSync(d).filter((f) => f.endsWith(ext)).length; } catch { return 0; } };
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
const names = () => { try { return Object.fromEntries([...readFileSync(join(ROOT, "bin/areas.py"), "utf8").matchAll(/"([a-z_]+)":\s*\{"name":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]])); } catch { return {}; } };
const building = (key) => {
  const D = join(ROOT, "data", key), O = join(ROOT, "out", key), hj = join(webDir(key), "hunt.json");
  const raw = dirSize(join(D, "raw")) + dirSize(join(D, "bags"));
  let hand = 0; try { hand = Object.keys(JSON.parse(readFileSync(join(O, "hand_check.json"), "utf8"))).length; } catch {}
  const bumps = lines(join(O, "private/local_bumps.csv")), fine = count(join(O, "fine"), ".npz"), todo = lines(join(O, "private/fine_todo.csv"));
  const have = (f) => existsSync(join(D, f));
  const logs = readdirSync(join(ROOT, "out")).filter((f) => f.startsWith(key + "_scan") && f.endsWith(".log")).map((f) => readFileSync(join(ROOT, "out", f), "utf8"));
  const doneScans = logs.flatMap((t) => [...t.matchAll(/^DONE \S+ (\d+)/gm)].map((m) => +m[1]));
  const lastBlock = logs.map((t) => (t.match(/^(\S+) block (\d+)\/(\d+)[^\n]*$(?![\s\S]*^DONE \1)/m) || [])).find((m) => m.length);
  const nBags = count(join(D, "bags"), ".tif");
  const scanLive = bumps ? `${bumps.toLocaleString("en-US")} bumps` : doneScans.length || lastBlock ? `${doneScans.length} of ${nBags} sonar files, ${doneScans.reduce((x, y) => x + y, 0).toLocaleString("en-US")} bumps` + (lastBlock ? `, now ${lastBlock[1].replace(/\.tif$/, "")} ${Math.round((lastBlock[2] / lastBlock[3]) * 100)}%` : "") : "";
  let log = []; try { log = readFileSync(join(O, "stages.log"), "utf8").trim().split("\n").slice(-8); } catch {}
  const steps = [
    { name: "Download the sonar", done: raw > 0, live: raw > 0 ? `${Math.round(raw / 1e6).toLocaleString("en-US")} MB` : "" },
    { name: "List the known wrecks", done: have("known.gpkg") || have("known_enc.gpkg"), live: have("known.gpkg") && have("known_enc.gpkg") ? "chart + wreck list" : have("known_enc.gpkg") ? "chart wrecks" : "" },
    { name: "Find bumps over 1 m", done: bumps > 0, live: scanLive },
    { name: "Close-up look", done: fine > 0 && fine >= todo, live: fine ? `${fine.toLocaleString("en-US")}${todo ? " of " + todo.toLocaleString("en-US") : ""} close-ups` : "" },
    { name: "Recall test", done: existsSync(join(O, "recall_implant.json")) || existsSync(join(O, "recall.json")), live: "" },
    { name: "Eye check", done: existsSync(hj) && hand > 0, live: hand ? `${hand} judged` : "" },
    { name: "Shortlist on the board", done: existsSync(hj), live: "" },
  ];
  const at = Math.max(mtime(D), mtime(join(D, "raw")), mtime(join(D, "bags")), mtime(O), mtime(join(O, "fine")), mtime(join(O, "private/local_bumps.csv")), mtime(join(O, "hand_check.json")), mtime(hj));
  return { steps, log, updated: new Date(at || Date.now()).toISOString() };
};
const birth = (key) => Math.min(...[join(ROOT, "data", key), join(ROOT, "out", key)].filter(existsSync).map((d) => statSync(d).birthtimeMs));
const runningAreas = (have, NAMES = names()) => [...new Set([...readdirSync(join(ROOT, "data"), { withFileTypes: true }), ...readdirSync(join(ROOT, "out"), { withFileTypes: true })].filter((d) => d.isDirectory() && /^[a-z_]+$/.test(d.name) && d.name !== "web" && NAMES[d.name]).map((d) => d.name))]
  .filter((k) => !have.has(k)).map((key) => ({ key, ...building(key) })).filter((a) => Date.now() - Date.parse(a.updated) < 3 * 3600e3)
  .map((a) => ({ key: a.key, name: NAMES[a.key] || a.key, running: true, started: new Date(birth(a.key)).toISOString(), updated: a.updated, steps: a.steps, log: a.log, leads: 0, shiplike: 0, maybe: 0, km2: null, closeups: null, source: "" }));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const ensureLive = (key) => {
  const pf = join(ROOT, "out", key + "_live.pid");
  const pid = existsSync(pf) ? +readFileSync(pf, "utf8") : 0;
  if (pid && alive(pid)) return;
  const log = openSync(join(ROOT, "out", key + "_live.log"), "a");
  const ch = spawn(join(ROOT, ".venv/bin/python"), ["-W", "ignore", join(ROOT, "bin/livepreview.py"), key], { cwd: ROOT, detached: true, stdio: ["ignore", log, log] });
  writeFileSync(pf, String(ch.pid)); ch.unref();
};
for (const d of ["out/web", "data"]) mkdirSync(join(ROOT, d), { recursive: true });
const listeners = new Set();
let timer;
for (const d of Object.values(DIRS)) watch(d, { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => listeners.forEach((res) => res.write("data: reload\n\n")), 400);
});

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/__reload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    listeners.add(res);
    return req.on("close", () => listeners.delete(res));
  }
  if (path === "/api/areas") {
    const done = listAreas(), have = new Set(done.map((a) => a.key));
    const run = runningAreas(have);
    const busy = done.map((a) => { const b = building(a.key); return Date.now() - Date.parse(b.updated) < 8 * 60e3 ? { ...a, running: true, partial: true, steps: b.steps, log: b.log, updated: b.updated } : a; });
    [...run, ...busy.filter((a) => a.running)].forEach((a) => ensureLive(a.key));
    const list = [...busy, ...run].sort((a, b) => a.started.localeCompare(b.started));
    return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(list));
  }
  const area = areaOf(req);
  if (path === "/api/live" || path === "/api/live/img") {
    const live = join(ROOT, "out", area, "private/live");
    if (path === "/api/live") {
      const f = join(live, "live.json");
      return res.writeHead(existsSync(f) ? 200 : 404, { "content-type": "application/json", "cache-control": "no-store" }).end(existsSync(f) ? readFileSync(f) : "{}");
    }
    const f = new URL(req.url, "http://x").searchParams.get("f") || "";
    if (!/^(overview\.png|thumbs\/\d+\.png)$/.test(f) || !existsSync(join(live, f))) return res.writeHead(404).end();
    return res.writeHead(200, { "content-type": "image/png", "cache-control": f.startsWith("thumbs") ? "max-age=3600" : "no-store" }).end(readFileSync(join(live, f)));
  }
  if (path === "/api/patch") {
    const q = new URL(req.url, "http://x").searchParams, id = q.get("id") || "", span = q.get("span") || "";
    if (!/^[AKL]\d{2,3}$/.test(id) || !["250", "500", "1000"].includes(span)) return res.writeHead(400).end();
    const f = join(ROOT, "out", area, "private/patch", `${id}_${span}.json`);
    const send = () => existsSync(f) ? res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(readFileSync(f)) : res.writeHead(404, { "content-type": "application/json" }).end("{}");
    if (existsSync(f)) return send();
    return spawn(join(ROOT, ".venv/bin/python"), ["-W", "ignore", join(ROOT, "bin/patch.py"), area, id, span], { cwd: join(ROOT, "bin"), stdio: "ignore" }).on("exit", send);
  }
  if (path === "/api/patchat") {
    const q = new URL(req.url, "http://x").searchParams, span = q.get("span") || "";
    const la = Number(q.get("lat")), lo = Number(q.get("lon"));
    const sj = join(ROOT, "out", area, "private/sonar/sonar.json");
    const b = existsSync(sj) ? JSON.parse(readFileSync(sj, "utf8")).bounds : null;
    if (!b || !["300", "1000", "3000"].includes(span) || !(lo >= b[0] && lo <= b[2] && la >= b[1] && la <= b[3])) return res.writeHead(400).end();
    const f = join(ROOT, "out", area, "private/patch", `at_${la.toFixed(5)}_${lo.toFixed(5)}_${span}.json`);
    const send = () => existsSync(f) ? res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(readFileSync(f)) : res.writeHead(404, { "content-type": "application/json" }).end("{}");
    if (existsSync(f)) return send();
    return spawn(join(ROOT, ".venv/bin/python"), ["-W", "ignore", join(ROOT, "bin/patch.py"), area, `@${la.toFixed(5)},${lo.toFixed(5)}`, span], { cwd: join(ROOT, "bin"), stdio: "ignore" }).on("exit", send);
  }
  if (path === "/api/sonar" || path === "/api/sonar/img" || path === "/api/sonar/z") {
    const f = join(ROOT, "out", area, "private/sonar", { "/api/sonar": "sonar.json", "/api/sonar/img": "sonar.png", "/api/sonar/z": "sonar_z.bin" }[path]);
    if (!existsSync(f)) return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ ok: false }));
    return res.writeHead(200, { "content-type": { "/api/sonar": "application/json", "/api/sonar/img": "image/png", "/api/sonar/z": "application/octet-stream" }[path], "cache-control": "no-store" }).end(readFileSync(f));
  }
  if (path === "/api/where") {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const file = join(ROOT, "out", area, "private/where.json");
    const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (!/^[AKL]\d{2,3}$/.test(id) || !all[id]) return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ ok: false }));
    return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ok: true, id, ...all[id] }));
  }
  if (path === "/api/map") {
    const priv = join(ROOT, "out", area, "private/");
    const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
    const where = read(join(priv, "where.json")), base = read(join(priv, "map.json")), all = read(join(webDir(area), "all.json")), hunt = read(join(webDir(area), "hunt.json"));
    if (!where || !base || !all) return res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ ok: false }));
    const short = new Map((hunt?.leads || []).filter((x) => x.all_id).map((x) => [x.all_id, x.id]));
    const leads = all.items.filter((i) => i.group !== "charted" && where[i.id]).map((i) => ({ id: i.id, short: short.get(i.id) || null, lat: where[i.id].lat, lon: where[i.id].lon, verdict: i.my_verdict, group: i.group, length_m: i.length_m, height_m: i.height_m, depth_m: i.depth_m, score: i.score, headline: i.headline }));
    return res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ok: true, area, leads, known: base.known, areas: base.areas }));
  }
  if (path === "/api/verdict") {
    if (req.method === "GET") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(readVerdicts(area)));
    let body = "";
    req.on("data", (c) => (body += c));
    return req.on("end", () => {
      try {
        const { id, verdict, note } = JSON.parse(body);
        if (!/^[AKL]\d{2,3}$/.test(id) || !["keep", "drop", "unsure", null].includes(verdict)) throw new Error("bad input");
        const all = readVerdicts(area);
        if (verdict === null) delete all[id];
        else all[id] = { verdict, note: String(note || "").slice(0, 500), at: new Date().toISOString() };
        writeFileSync(verdictFile(area), JSON.stringify(all, null, 1));
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, count: Object.keys(all).length }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }
  const [prefix, dir] = Object.entries(DIRS).find(([p]) => path.startsWith(p));
  let file = normalize(join(dir, path.slice(prefix.length) || "index.html"));
  if (!file.startsWith(dir)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end("not found");
  let body = readFileSync(file);
  if (file.endsWith(".html")) body = body.toString().replace("</body>", `${RELOAD}</body>`);
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => console.log(`http://wreck-hunt.localhost:${PORT}`));
