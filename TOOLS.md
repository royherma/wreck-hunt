# Wreck Hunt tools

## The tools

| Job it owns | Tool | Run it | Writes to | Area |
| --- | --- | --- | --- | --- |
| Wreck Hunt: uncharted shipwreck leads from NOAA sonar, 3D seabed per lead, Sample / Real switch | `server.mjs` | `node server.mjs` (port 5027) | reads `out/web/hunt.json` | Research |
| Area switch: pick Chesapeake or Bayfield (Lake Superior) in the tab bar, or add `?area=<name>`; each area's data in `out/web/<area>/` | `public/area.js` + `public/tabs.js` | `node server.mjs`, any page | reads `out/<area>/` | Research |
| Lost ships: ships lost in the area with no known position, size, cargo, story, and which lead could match by size | `public/lost.html` | `node server.mjs`, then /lost.html (data: `AREA=<area> .venv/bin/python bin/missing.py`) | reads `out/web/<area>/missing.json` | Research |
| Review every close-up yourself: grid of all 281, filters, 3D, Keep / Drop / Unsure (K / X / U) saved to `out/chesapeake_mouth/roy_check.json` | `public/all.html` | `node server.mjs`, then /all.html | `out/chesapeake_mouth/roy_check.json` | Research |
| Map of everything: every lead vs every known wreck, nearest 3 with distances, rings, private positions | `public/map.html` | `node server.mjs`, then /map.html (data: `.venv/bin/python bin/mapdata.py` -> `out/chesapeake_mouth/private/map.json`) | reads private `where.json` + `map.json` via `/api/map` | Research |
| Hunt in progress: live stages of a running hunt (sonar MB, wreck list, bumps, close-ups, eye check), refreshes every 4 s; the area menu marks it "building now" | `public/build.html` | `node server.mjs`, then /build.html?area=<key> (opens itself for a running area) | reads `/api/areas` (counts from `data/<area>`, `out/<area>`, `out/<area>/stages.log`) | Research |
| Public board build: pages + board data for Cloudflare Pages, uncharted leads blurred to 20 km, no private files, local-only pages dropped | `scripts/build-public.mjs` | `npm run build:public` | `dist/` | Research |
