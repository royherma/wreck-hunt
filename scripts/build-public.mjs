import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist");
const WEB = join(ROOT, "out/web");
const CELL = Number(process.env.PUBLIC_CELL_KM) || 20;
const DEF = "chesapeake_mouth";
const LOCAL_ONLY = ["build.html", "build.js", "map.html", "map.js", "map.css", "docket.html", "docket.css", "docket"];

const blur = (it) => {
  if (it.group === "charted" || it.my_verdict === "charted") return it;
  const out = { ...it };
  if (it.where) {
    const snap = (v) => Math.floor(v / CELL) * CELL + CELL / 2;
    out.where = { x_km: snap(it.where.x_km), y_km: snap(it.where.y_km), cell_km: CELL, text: `somewhere in this ${CELL} km square` };
  }
  if (it.depth_m != null) out.depth_m = Math.round(it.depth_m / 5) * 5;
  if (it.nearest_charted_km != null) out.nearest_charted_km = Math.max(5, Math.ceil(it.nearest_charted_km / 5) * 5);
  return out;
};
const blurHunt = (h) => ({ ...h, leads: (h.leads || []).map(blur) });
const blurAll = (a) => ({ ...a, items: (a.items || []).map(blur) });

const areas = [DEF, ...(existsSync(WEB) ? readdirSync(WEB, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(WEB, d.name, "hunt.json"))).map((d) => d.name) : [])]
  .filter((a) => existsSync(join(a === DEF ? WEB : join(WEB, a), "hunt.json")));
const only = process.env.AREAS ? process.env.AREAS.split(",") : null;
const ship = only ? areas.filter((a) => only.includes(a)) : areas;

rmSync(OUT, { recursive: true, force: true });
cpSync(join(ROOT, "public"), OUT, { recursive: true, filter: (src) => !LOCAL_ONLY.some((f) => src.endsWith("/" + f)) && !/\.bak/.test(src) });

for (const f of readdirSync(OUT).filter((f) => f.endsWith(".html"))) {
  const p = join(OUT, f);
  writeFileSync(p, readFileSync(p, "utf8").replace(/<script src="http:\/\/127\.0\.0\.1:4800\/nav\.js"[^>]*><\/script>\n?/, ""));
}

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
  const h = JSON.parse(readFileSync(join(src, "hunt.json"), "utf8")), L = h.leads || [];
  list.push({ key: a, name: h.area?.name || a, source: h.area?.source || "NOAA", km2: h.funnel?.[0]?.count ?? h.area?.sonar_km2 ?? null, closeups: h.funnel?.[3]?.count ?? null,
    leads: L.length, shiplike: L.filter((l) => l.verdict === "ship-like").length, maybe: L.filter((l) => l.verdict === "maybe").length,
    started: statSync(join(ROOT, "out", a)).birthtime.toISOString(), finished: h.generated_at || null });
}
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
