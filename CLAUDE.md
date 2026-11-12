# Wreck Hunt - guide for coding agents

You are probably here because someone asked you to **run a hunt on a new area and send the
results back**. This file is the whole job. Read it top to bottom before the first command.

## Never break these

1. **No exact position of an uncharted lead leaves this machine.** Not in a commit, a PR, an
   issue, a screenshot or a chat message. Precise data lives in `out/<area>/private/`, which is
   gitignored. Charted wrecks are public already and are fine.
2. **Only `contrib/<area>/` goes in the pull request**, made by `scripts/package-area.mjs`. Never
   `git add -f` anything under `out/` or `data/`.
3. **Say what you measured.** The PR states recall (known wrecks re-found, or planted hulls
   found), close-ups judged, and what you could not finish. A failed step is reported, not hidden.

## The job, start to finish

```
pick area -> add to bin/areas.py -> download sonar -> known wrecks -> find bumps
  -> close-ups -> recall test -> score -> eye check -> export -> package -> pull request
```

Every script reads `AREA=<key>`. Run them from `bin/` with `../.venv/bin/python -W ignore`.
Setup once: `python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt`.

| # | Step | How | Writes |
| --- | --- | --- | --- |
| 1 | Pick an area | `docs/next-regions.md` ranks candidates; check the `contrib/` folder and open PRs so you don't redo one. Needs public multibeam at 2 m or finer | - |
| 2 | Add it | New entry in `AREAS` in `bin/areas.py`: name, bbox (W, S, E, N), UTM `utm`/`proj` EPSG, `enc` chart states, `place_pts` (2-4 towns for the "near X" text), `locator` | - |
| 3a | Sonar, BlueTopo tiles | Make `data/<area>/tiles.txt` (one tile URL per line) from `data/tilescheme.gpkg` filtered by the bbox, then `bin/fetch-area.sh <area>` | `data/<area>/tiles/` |
| 3b | Sonar, BAG surveys | Find survey BAGs for the bbox at NOAA NCEI, then `getbag.py data/<area>/bags <url> ...` (resumes) | `data/<area>/bags/` |
| 4 | Known wrecks | `known.py` (NOAA chart wrecks), `known_enc.py` (ENC cells from step 3a), plus `data/<area>/awois.csv` (AWOIS wreck list rows inside the bbox) | `known*.gpkg` |
| 5 | Find bumps | Tiles: `scan.py` (`COARSE=1` first pass). BAGs: `bagscan.py`, then `localpatch.py <bag>` per file | `out/<area>/scan_*`, `private/*bumps*.csv` |
| 6 | Close-ups | Tiles: `fine.py` (reads sonar remotely). BAGs: done by `localpatch.py` | `out/<area>/fine/*.npz` |
| 7 | Recall test | `recall.py` if charted wrecks lie in the sonar; else `implant.py <tif>` plants 60 fake hulls | `recall*.json` |
| 8 | Score | `preview.py`, then `FINE=fine_preview.json rank.py`, then `edges.py` | `fine_*_plus.json`, `private/edges.csv` |
| 9 | Eye check | Run step 10 once, open `/all.html?area=<area>` (step 11), look at the top ~40 close-ups in 3D, write verdicts to `out/<area>/hand_check.json` (format below), then run step 10 again | `hand_check.json` |
| 10 | Export | `ALL=1 STATUS=done FINE=fine_preview_plus.json export.py`, then `sonarmap.py`, `mapdata.py`, optional `missing.py` | `out/web/<area>/` |
| 11 | Look | `node server.mjs`, open `http://localhost:5027/?area=<area>` and `/all.html?area=<area>`; fix anything broken | - |
| 12 | Package | `node scripts/package-area.mjs <area>` (blurs new finds to 20 km, keeps the best 200 close-ups, fails on a position leak) | `contrib/<area>/` |
| 13 | Send | Branch `area/<key>`, commit `bin/areas.py` + `contrib/<area>/` only, `gh pr create` with the template below | PR |

The pipeline grew one area at a time, so expect rough edges: `recall.py` assumes UTM 18N,
`fetch-area.sh` downloads the VA and MD chart cells (swap in your area's `enc` states), and
`tiles.txt` / `awois.csv` have no script yet. Fix what blocks you and include the fix in the PR.

## Eye check format (`out/<area>/hand_check.json`)

```json
{ "F<id>": { "verdict": "ship-like | maybe | unlikely", "note": "what you saw, one line", "rank": 0, "at": "YYYY-MM-DD" } }
```

`ship-like`: straight sides, square ends or a hull outline, stands alone on flat seabed.
`unlikely`: rock ledge, sand wave, pockmark, swath-edge noise, sonar hole. Most bumps are rock.

## Pull request text

```
Area: <name> (<key>), <km²> km² of <source> sonar
Recall: <n of m charted wrecks re-found | n of 60 planted hulls found>
Close-ups: <shipped> of <total>, <judged> judged by eye: <ship-like> ship-like, <maybe> maybe
Not done: <steps skipped and why>
```

## Code rules

- Pages are plain ES modules in `public/`, `server.mjs` uses only Node built-ins. No build step.
- Every score part carries a `why` line saying what it measured and what pulled it down.
- Public build: `npm run build:public` writes `dist/`; `wrangler deploy` is the maintainer's job.
