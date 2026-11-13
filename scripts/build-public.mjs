import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { blurHunt, blurAll, CELL } from "./blur.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist");
const WEB = join(ROOT, "out/web");
const DEF = "chesapeake_mouth";
const LOCAL_ONLY = ["build.html", "build.js", "map.html", "map.js", "docket.html", "docket.css", "docket"];

const areas = [DEF, ...(existsSync(WEB) ? readdirSync(WEB, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(WEB, d.name, "hunt.json"))).map((d) => d.name) : [])]
  .filter((a) => existsSync(join(a === DEF ? WEB : join(WEB, a), "hunt.json")));
const only = process.env.AREAS ? process.env.AREAS.split(",") : null;
const ship = only ? areas.filter((a) => only.includes(a)) : areas;

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, "public"), OUT, { recursive: true, filter: (src) => !LOCAL_ONLY.some((f) => src.endsWith("/" + f)) && !/\.bak/.test(src) });

for (const f of readdirSync(OUT).filter((f) => f.endsWith(".html"))) {
  const p = join(OUT, f);
  writeFileSync(p, readFileSync(p, "utf8").replace(/<script src="http:\/\/127\.0\.0\.1:4800\/nav\.js"[^>]*><\/script>\n?/, "").replace(/<span class="seg" id="caround".*?<\/span>/, ""));
}

const whole = join(OUT, "wholescan.js");
let ws = readFileSync(whole, "utf8");
for (const [from, to] of [
  ['get("/api/sonar")', 'get("/data/sonar/sonar.json")'],
  ['get("/api/sonar/z")', 'get("/data/sonar/sonar_z.bin")'],
  ['get("/api/map")', 'get("/data/sonar/map.json")'],
  ["`/api/sonar/img?area=${area()}`", '`/data/${!area() || area() === "chesapeake_mouth" ? "" : area() + "/"}sonar/sonar.png`'],
  [" Click away to unselect, double-click the seabed for sharp sonar.", " Click away to unselect."],
]) { if (!ws.includes(from)) throw new Error("wholescan.js changed, missing: " + from); ws = ws.replace(from, to); }
writeFileSync(whole, ws);

const tabs = join(OUT, "tabs.js");
writeFileSync(tabs, readFileSync(tabs, "utf8").split("\n").filter((l) => !/^\s*\["(map|ev)",/.test(l)).join("\n"));

const list = [];
for (const a of ship) {
  const src = a === DEF ? WEB : join(WEB, a), dst = a === DEF ? join(OUT, "data") : join(OUT, "data", a);
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (a !== DEF || !existsSync(join(ROOT, "out", e.name))) cpSync(join(src, e.name), join(dst, e.name), { recursive: true }); continue; }
    const raw = readFileSync(join(src, e.name));
    if (e.name === "hunt.json") writeFileSync(join(dst, e.name), JSON.stringify(blurHunt(JSON.parse(raw))));
    else if (e.name === "all.json") writeFileSync(join(dst, e.name), JSON.stringify(blurAll(JSON.parse(raw))));
    else writeFileSync(join(dst, e.name), raw);
  }
  const sonar = join(ROOT, "out", a, "private/sonar"), base = join(ROOT, "out", a, "private/map.json");
  if (existsSync(join(sonar, "sonar.json")) && existsSync(base)) {
    mkdirSync(join(dst, "sonar"), { recursive: true });
    for (const f of ["sonar.json", "sonar.png", "sonar_z.bin"]) cpSync(join(sonar, f), join(dst, "sonar", f));
    const m = JSON.parse(readFileSync(base, "utf8"));
    writeFileSync(join(dst, "sonar/map.json"), JSON.stringify({ ok: true, known: m.known || [], areas: m.areas || [], leads: [] }));
  }
  const h = JSON.parse(readFileSync(join(src, "hunt.json"), "utf8")), L = h.leads || [];
  list.push({ key: a, name: h.area?.name || a, source: h.area?.source || "NOAA", km2: h.funnel?.[0]?.count ?? h.area?.sonar_km2 ?? null, closeups: h.funnel?.[3]?.count ?? null,
    leads: L.length, shiplike: L.filter((l) => l.verdict === "ship-like").length, maybe: L.filter((l) => l.verdict === "maybe").length,
    started: statSync(join(ROOT, "out", a)).birthtime.toISOString(), finished: h.generated_at || null });
}
const CONTRIB = join(ROOT, "contrib");
for (const a of existsSync(CONTRIB) ? readdirSync(CONTRIB).filter((d) => /^[a-z_]+$/.test(d) && !ship.includes(d) && existsSync(join(CONTRIB, d, "hunt.json"))) : []) {
  if (only && !only.includes(a)) continue;
  cpSync(join(CONTRIB, a), join(OUT, "data", a), { recursive: true });
  const h = JSON.parse(readFileSync(join(CONTRIB, a, "hunt.json"), "utf8")), L = h.leads || [];
  const meta = existsSync(join(CONTRIB, a, "meta.json")) ? JSON.parse(readFileSync(join(CONTRIB, a, "meta.json"), "utf8")) : {};
  list.push({ key: a, name: h.area?.name || meta.name || a, source: h.area?.source || "NOAA", km2: h.funnel?.[0]?.count ?? h.area?.sonar_km2 ?? null, closeups: h.funnel?.[3]?.count ?? null,
    leads: L.length, shiplike: L.filter((l) => l.verdict === "ship-like").length, maybe: L.filter((l) => l.verdict === "maybe").length,
    started: meta.packaged_at || h.generated_at || new Date(0).toISOString(), finished: h.generated_at || null, contributed: true });
  ship.push(a);
}
const CARDS = join(ROOT, "out/cards");
for (const a of ship) if (existsSync(join(CARDS, a))) cpSync(join(CARDS, a), join(OUT, "cards", a), { recursive: true });
mkdirSync(join(OUT, "api"), { recursive: true });
writeFileSync(join(OUT, "api/areas.json"), JSON.stringify(list.sort((x, y) => x.started.localeCompare(y.started))));
writeFileSync(join(OUT, "api/verdict.json"), "{}");
writeFileSync(join(OUT, "_redirects"), ["/api/areas /api/areas.json 200", "/api/verdict /api/verdict.json 200"].join("\n") + "\n");
writeFileSync(join(OUT, "404.html"), "<!doctype html><meta charset=utf-8><title>Not found</title><p>Not found. <a href=\"/\">Wreck Hunt</a></p>");

let files = 0, bytes = 0, big = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { const s = statSync(p).size; files++; bytes += s; if (s > 25 * 2 ** 20) big.push(p); } } };
walk(OUT);
const leak = existsSync(join(OUT, "data")) && JSON.stringify(readdirSync(join(OUT, "data"), { recursive: true })).includes("private");
console.log(`dist: ${files} files, ${(bytes / 1e6).toFixed(0)} MB, areas: ${ship.join(", ")}, uncharted cells ${CELL} km${big.length ? `, OVER 25 MiB: ${big.join(" ")}` : ""}${leak ? ", PRIVATE FOLDER FOUND" : ""}`);
if (big.length || leak || files > 20000) process.exit(1);
