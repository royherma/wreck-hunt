import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { blurHunt, blurAll, CELL } from "./blur.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const area = process.argv[2];
const MAX = Number(process.env.MAX_CLOSEUPS) || 200;
if (!area || !/^[a-z_]+$/.test(area) || area === "chesapeake_mouth") {
  console.error("usage: node scripts/package-area.mjs <area>   (an area key from bin/areas.py, not chesapeake_mouth)");
  process.exit(2);
}
const web = join(ROOT, "out/web", area), priv = join(ROOT, "out", area, "private");
if (!existsSync(join(web, "hunt.json")) || !existsSync(join(web, "all.json"))) {
  console.error(`no board data in out/web/${area}/: run the hunt through bin/export.py first`);
  process.exit(1);
}

const hunt = JSON.parse(readFileSync(join(web, "hunt.json"), "utf8"));
const all = JSON.parse(readFileSync(join(web, "all.json"), "utf8"));
const keep = new Set([...(hunt.leads || []).map((l) => l.all_id).filter(Boolean), ...all.items.filter((i) => i.group === "charted").map((i) => i.id)]);
for (const it of [...all.items].sort((a, b) => b.score - a.score)) { if (keep.size >= MAX) break; keep.add(it.id); }
const items = all.items.filter((i) => keep.has(i.id));
const groups = Object.fromEntries(Object.keys(all.groups || {}).map((g) => [g, items.filter((i) => i.group === g).length]));

const out = join(ROOT, "contrib", area);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const hfPath = (p) => join(ROOT, "out/web", p.replace(/^\/data\//, ""));
const copyHf = (p) => { if (!p) return; const src = hfPath(p), dst = join(out, p.replace(new RegExp(`^/data/${area}/`), "")); if (existsSync(src)) { mkdirSync(dirname(dst), { recursive: true }); cpSync(src, dst); } };
items.forEach((i) => copyHf(i.heightfield));
(hunt.leads || []).forEach((l) => copyHf(l.heightfield));
(hunt.known || []).forEach((k) => copyHf(k.heightfield));

writeFileSync(join(out, "hunt.json"), JSON.stringify(blurHunt(hunt)));
writeFileSync(join(out, "all.json"), JSON.stringify(blurAll({ ...all, items, count: items.length, groups })));
if (existsSync(join(web, "missing.json"))) cpSync(join(web, "missing.json"), join(out, "missing.json"));
if (existsSync(join(priv, "sonar/sonar.json")) && existsSync(join(priv, "map.json"))) {
  mkdirSync(join(out, "sonar"));
  for (const f of ["sonar.json", "sonar.png", "sonar_z.bin"]) cpSync(join(priv, "sonar", f), join(out, "sonar", f));
  const m = JSON.parse(readFileSync(join(priv, "map.json"), "utf8"));
  writeFileSync(join(out, "sonar/map.json"), JSON.stringify({ ok: true, known: m.known || [], areas: m.areas || [], leads: [] }));
}
const git = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } };
writeFileSync(join(out, "meta.json"), JSON.stringify({ area, name: hunt.area?.name || area, packaged_at: new Date().toISOString(), scanner_commit: git("git rev-parse --short HEAD"), closeups_total: all.items.length, closeups_shipped: items.length, cell_km: CELL }, null, 1));

let bytes = 0, files = 0;
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else { files++; bytes += statSync(p).size; } } };
walk(out);
const leak = JSON.stringify(readdirSync(out, { recursive: true })).includes("private") || /"lat"\s*:/.test(readFileSync(join(out, "all.json"), "utf8"));
console.log(`contrib/${area}: ${files} files, ${(bytes / 1e6).toFixed(1)} MB, ${items.length} of ${all.items.length} close-ups, new finds in ${CELL} km squares${leak ? ", POSITION LEAK, do not commit" : ""}`);
if (leak) process.exit(1);
