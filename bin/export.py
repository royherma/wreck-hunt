import json, os, glob, re, sys
from pyproj import Transformer
from datetime import datetime, timezone, timedelta
import numpy as np, pandas as pd
from scipy import ndimage as ndi
from areas import AREA, CFG, DATA, OUTA, PROJ, ROOT

WEB = os.path.join(ROOT, "out", "web") if AREA == "chesapeake_mouth" else os.path.join(ROOT, "out", "web", AREA)
URL = "/data" if AREA == "chesapeake_mouth" else f"/data/{AREA}"
HF_N = 128


def score_parts(r):
    cr, H, sc, es, bg, oth, L = r.crisp_ratio, r.height_m, r.scour_m, r.edge_slope, r.bg_p95, r.others, r.length_m
    lone = 1 if oth == 0 else (0.5 if oth <= 2 else 0)
    jag = "jagged like a wreck" if cr >= 8 else ("rougher than sand" if cr >= 3 else "smooth like a sand hill")
    parts = [
        ("Jagged, not a smooth hill", float(np.clip((cr - 2) / 10, 0, 1) * 4), 4, f"surface {cr:.0f}x rougher than the seabed around it, {jag}; charted wrecks are about 14x"),
        ("Height off seabed", float(min(H / 2.5, 1) * 2), 2, f"{H:.1f} m tall, full marks at 2.5 m"),
        ("Scour mark", float(np.clip(sc / 1.5, 0, 1) * 2), 2, f"current dug {sc:.1f} m down beside it, full marks at 1.5 m"),
        ("Steep sides", float(np.clip(es / 20, 0, 1)), 1, f"edges slope {es:.0f}°, full marks at 20°"),
        ("Flat seabed around it", float(np.clip(1 - (bg - 0.2) / 0.8, 0, 1)), 1, f"background bumps up to {bg:.1f} m"),
        ("Stands alone", lone, 1, "nothing else within 120 m" if oth == 0 else f"{oth} other bump{'s' if oth > 1 else ''} within 120 m"),
        ("Ship size", 1 if 15 <= L <= 250 else 0, 1, f"{L:.0f} m long"),
    ]
    return [{"name": n, "value": round(v, 2), "max": m, "why": w} for n, v, m, w in parts]


def pulled_down(parts):
    lost = sorted(((p["max"] - p["value"], p) for p in parts), key=lambda t: -t[0])
    lost = [(d, p) for d, p in lost if d > 0.05]
    if not lost:
        return "Full marks on every check"
    return "; ".join(f"{p['name']} lost {d:.1f}: {p['why']}" for d, p in lost[:2])


def heightfield(rid, r, frame=None):
    f = os.path.join(OUTA, "fine", rid + ".npz")
    d = np.load(f)
    z, cell = d["z"], float(d["cell"])
    fr = frame or {}
    obj = float(fr.get("span_m", max(100, 2.6 * r.length_m)))
    span = float(np.clip(obj, 100, 0.98 * z.shape[0] * cell))
    half = int(span / 2 / cell)
    cy, cx = int(r.cy + fr.get("dy_m", 0) / cell), int(r.cx + fr.get("dx_m", 0) / cell)
    ok0 = np.isfinite(z)
    g = ndi.gaussian_filter(np.where(ok0, z, 0), 1.5 / cell), ndi.gaussian_filter(ok0.astype(float), 1.5 / cell)
    z = np.where(ok0, z, np.where(g[1] > 0.15, g[0] / np.maximum(g[1], 1e-6), np.nan))
    pad = np.pad(z, half, mode="edge")
    w = pad[cy:cy + 2 * half, cx:cx + 2 * half]
    ok = np.isfinite(w)
    if not ok.all():
        idx = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True)
        w = w[tuple(idx)]
    k = HF_N / w.shape[0]
    w = ndi.zoom(w, k, order=1)[:HF_N, :HF_N]
    yy, xx = np.mgrid[:HF_N, :HF_N]
    edge = np.zeros_like(w, bool); edge[:6] = edge[-6:] = True; edge[:, :6] = edge[:, -6:] = True
    A = np.c_[xx[edge], yy[edge], np.ones(edge.sum())]
    coef, *_ = np.linalg.lstsq(A, w[edge], rcond=None)
    w = w - (coef[0] * xx + coef[1] * yy + coef[2])
    w = w - np.median(w)
    out = {"w": HF_N, "h": HF_N, "cell_m": round(span / HF_N, 3), "z": [round(float(v), 2) for v in w.ravel()]}
    if frame:
        out.update(ax=round((r.cx - cx + half) * k, 1), ay=round((r.cy - cy + half) * k, 1), obj_m=round(min(obj, span)))
    return out


BAR = 8.0


def verdict(r):
    if isinstance(r.verdict_hand, str) and r.verdict_hand:
        return r.verdict_hand
    if r.crisp_ratio < 3:
        return "unlikely"
    return "ship-like" if r.score >= BAR else ("maybe" if r.score >= 0.75 * BAR else "unlikely")


def headline(r):
    bits = [f"{r.length_m:.0f} m long", f"{r.height_m:.1f} m tall"]
    if r.edge_slope >= 20:
        bits.append("steep sides")
    if r.others == 0:
        bits.append("alone on flat sand")
    return ", ".join(bits).capitalize()


DIRS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def where(ctx, ox, oy):
    x0, y0 = ctx["origin"]
    cx = (np.floor((ox - x0) / 5000) + 0.5) * 5
    cy = (np.floor((oy - y0) / 5000) + 0.5) * 5
    best = min(ctx["places"], key=lambda p: (p["ux"] - ox) ** 2 + (p["uy"] - oy) ** 2)
    dx, dy = ox - best["ux"], oy - best["uy"]
    km = max(5, int(round(np.hypot(dx, dy) / 5000) * 5))
    d = DIRS[int(((np.degrees(np.arctan2(dx, dy)) % 360) + 22.5) // 45) % 8]
    return {"x_km": round(float(cx), 1), "y_km": round(float(cy), 1), "cell_km": 5, "text": f"about {km} km {d} of {best['name']}"}


def nearest(items, ox, oy, max_m):
    if not items:
        return None, None
    d2 = [((it["ux"] - ox) ** 2 + (it["uy"] - oy) ** 2, it) for it in items]
    dd, it = min(d2, key=lambda t: t[0])
    return (it, float(np.sqrt(dd))) if dd <= max_m ** 2 else (None, float(np.sqrt(dd)))


COORD = re.compile(r"(LAT(ITUDE)?|LONG?(ITUDE)?|LAT\.|LON\.)\s*[\d\-\.\s'\"NSEW]+|\d{2}-\d{2}-\d{2}(\.\d+)?\s*[NSEW]?|\d{1,3}\.\d{3,}|\(NAD\s*\d+\)|\d[\d,]*\s*YARDS?,?\s*\d+\s*DEG\.?|\bIN APPROX\.?", re.I)


def reported_year(h):
    m = re.match(r"\s*[A-Z]{1,3}\d+/(\d{2})", str(h))
    if m:
        y = int(m.group(1))
        return 1900 + y if y > 26 else 2000 + y
    m = re.search(r"\((19\d{2}|20[0-2]\d)\)", str(h))
    return int(m.group(1)) if m else None


def story(h):
    h = re.sub(r"^\s*[A-Z0-9/\-]{3,}\s*(WD\s*\(\d{4}\))?\s*--\s*", "", " ".join(str(h).split()))
    h = COORD.sub("", h)
    h = re.sub(r"\s+([,.;])", r"\1", re.sub(r"\s{2,}", " ", h)).strip(" ,;-")
    h = h[:220].rsplit(" ", 1)[0] + "..." if len(h) > 220 else h
    return h[:1].upper() + h[1:].lower() if h.isupper() else h


def progress():
    import re
    global FS
    FS = (open(f"{OUTA}/fullscan.log").read() or "waiting") if os.path.exists(f"{OUTA}/fullscan.log") else ""
    LOG = f"{OUTA}/{os.environ.get('PROGRESS_LOG', 'fine.log')}"
    log = open(LOG).read() if os.path.exists(LOG) else ""
    total = len(pd.read_csv(f"{OUTA}/private/fine_todo.csv"))
    m0 = re.search(r"patches (\d+) jobs", log)
    if m0:
        total = int(m0.group(1))
    m = re.findall(r"chunk (\d+)/(\d+) patches (\d+) errors (\d+) (\d+)s", log)
    done_n, secs = (int(m[-1][2]), int(m[-1][4])) if m else (0, 0)
    if os.environ.get("PROGRESS_LOG"):
        done_n = min(total, done_n)
    finished = "DONE" in log or os.environ.get("STATUS", "done") == "done" or bool(FS)
    if "DONE" in log:
        done_n = total
    eta = None if finished or not done_n else round((total - done_n) * secs / done_n / 60, 1)
    look = "done" if finished else "running"
    after = "done" if FS or os.environ.get("STATUS", "done") == "done" else ("running" if finished else "todo")
    return {"state": "done" if os.environ.get("STATUS", "done") == "done" else "running",
            "updated_at": datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds"), "eta_min": eta,
            "steps": [
                {"name": "Map the seabed", "state": "done", "done": FN["tiles"], "total": FN["tiles"], "unit": "sonar tiles" if FN["tiles"] > 1 else "sonar grid"},
                {"name": "Find bumps over 1 m", "state": "done", "done": FN["bumps"], "total": FN["bumps"], "unit": "bumps"},
                {"name": "Drop charted ones", "state": "done", "done": FN["charted_features"] + FN.get("old_list", 458), "total": FN["charted_features"] + FN.get("old_list", 458), "unit": "chart and wreck-list entries"},
                {"name": "Close-up look", "state": look, "done": done_n, "total": total, "unit": "close-ups"},
                *([{"name": "Full 0.5 m scan of 5 surveys", "state": "done" if "FULLSCAN DONE" in FS else "running", "done": FS.count("SCAN "), "total": 5, "unit": "surveys"}] if FS else []),
                {"name": "Score and hand check", "state": after, "done": None, "total": None, "unit": ""},
                {"name": "Shortlist on the board", "state": "done" if os.environ.get("BOARD") == "1" else "todo", "done": None, "total": None, "unit": ""},
            ]}


def funnel():
    p = f"{OUTA}/funnel_scan_coarse.json"
    if os.path.exists(p):
        return json.load(open(p))
    import glob, rasterio
    bumps = [b for g in glob.glob(f"{OUTA}/bag_scan/*.json") for b in json.load(open(g))]
    km2 = 0.0
    for g in glob.glob(f"{DATA}/bags/*.tif"):
        with rasterio.open(g) as r:
            z = r.read(1); km2 += float(((z != r.nodata) & (z < 100)).sum() * abs(r.res[0] * r.res[1]) / 1e6)
    lb = pd.read_csv(f"{OUTA}/private/local_bumps.csv")
    import geopandas as gpd
    kc = sum(len(gpd.read_file(g)) for g in glob.glob(f"{DATA}/known*.gpkg"))
    return {"tiles": len(glob.glob(f"{DATA}/bags/*.tif")), "seabed_km2": round(km2), "modern_km2": round(km2), "bumps": len(bumps), "uncharted": len(lb), "charted_features": kc, "old_list": 0}


FN = None
if __name__ == "__main__":
    FN = funnel()
    SRC = os.environ.get("FINE", "fine.json")
    fine = pd.DataFrame([o for o in json.load(open(f"{OUTA}/{SRC}")) if "err" not in o and o.get("blob")])
    todo = pd.read_csv(f"{OUTA}/private/fine_todo.csv")
    COARSE = f"{OUTA}/private/all_bumps_scan_coarse.csv"
    allb = pd.read_csv(COARSE)[["id", "known_dist_m", "lon", "lat"]] if os.path.exists(COARSE) else pd.DataFrame(columns=["id", "known_dist_m", "lon", "lat"])
    if os.path.exists(f"{OUTA}/private/local_bumps.csv"):
        allb = pd.concat([allb, pd.read_csv(f"{OUTA}/private/local_bumps.csv")[["id", "known_dist_m", "lon", "lat"]]]).drop_duplicates("id")
    LL = allb[["id", "lon", "lat"]]
    allb = allb[["id", "known_dist_m"]]
    fine = fine.merge(todo, on="id").merge(allb, on="id", how="left")
    fine = fine[fine.length_m.between(10, 320) & (fine.depth_fine_m >= 3)]
    from pyproj import Transformer
    Transformer = Transformer
    fine = fine.merge(LL, on="id", how="left")
    tf = Transformer.from_crs(4326, PROJ, always_xy=True)
    ex, ey = tf.transform(fine.lon.values, fine.lat.values)
    n = np.array([np.load(f"{OUTA}/fine/{i}.npz")["z"].shape[0] for i in fine.id])
    fine["ox"] = ex + (fine.cx - n / 2) * fine.cell_m
    fine["oy"] = ey - (fine.cy - n / 2) * fine.cell_m
    import geopandas as gpd
    kp = pd.concat([gpd.read_file(f"{DATA}/{f}")[["geometry"]] for f in ("known_enc.gpkg", "known.gpkg") if os.path.exists(f"{DATA}/{f}")])
    kp = gpd.GeoSeries(kp.geometry.representative_point(), crs=4326).to_crs(PROJ)
    fp = gpd.GeoDataFrame(geometry=gpd.points_from_xy(fine.ox, fine.oy), crs=PROJ, index=fine.index)
    kd = gpd.sjoin_nearest(fp, gpd.GeoDataFrame(geometry=kp.values, crs=PROJ), distance_col="d").groupby(level=0).d.min()
    fine["known_dist_m"] = np.fmin(fine.known_dist_m.astype(float).fillna(1e9), kd.reindex(fine.index).fillna(1e9))
    fine.loc[(fine.group == "uncharted") & (fine.known_dist_m <= CFG.get("known_m", 250)), "group"] = "charted"
    fine["parts"] = fine.apply(score_parts, axis=1)
    fine["score"] = fine.parts.apply(lambda ps: round(sum(p["value"] for p in ps), 2))
    fine = fine.sort_values("score", ascending=False)
    keep, seen = [], []
    for r in fine.itertuples():
        if any((r.ox - x) ** 2 + (r.oy - y) ** 2 < 25 ** 2 for x, y in seen):
            continue
        seen.append((r.ox, r.oy)); keep.append(r.Index)
    fine = fine.loc[keep]
    ctx = json.load(open(f"{OUTA}/private/context.json"))
    aw = [a for a in ctx["awois"]]
    fine["awois_m"] = [nearest(aw, r.ox, r.oy, 1e9)[1] for r in fine.itertuples()]
    on_list = (fine.group == "uncharted") & (fine.awois_m <= 250)
    fine.loc[on_list, "group"] = "on_old_list"
    import geopandas as gpd
    ka = gpd.read_file(f"{DATA}/known_enc.gpkg"); kb = gpd.read_file(f"{DATA}/known.gpkg")
    areas = pd.concat([ka[ka.geom_type.isin(["Polygon", "MultiPolygon"])][["geometry"]], kb[kb.geom_type.isin(["Polygon", "MultiPolygon"])][["geometry"]]])
    areas = gpd.GeoDataFrame(areas, crs=4326).to_crs(PROJ).buffer(100).union_all()
    pts = gpd.GeoSeries(gpd.points_from_xy(fine.ox, fine.oy), crs=PROJ, index=fine.index)
    in_area = (fine.group == "uncharted") & pts.within(areas)
    fine.loc[in_area, "group"] = "in_charted_area"
    hand = {}
    if os.path.exists(f"{OUTA}/hand_check.json"):
        hand = json.load(open(f"{OUTA}/hand_check.json"))
    fine["verdict_hand"] = fine.id.map(lambda i: (hand.get(i) or {}).get("verdict"))
    fine["note_hand"] = fine.id.map(lambda i: (hand.get(i) or {}).get("note"))
    fine.drop(columns="parts").to_csv(f"{OUTA}/private/fine_scored.csv", index=False)

    un = fine[fine.group == "uncharted"].sort_values("score", ascending=False)
    ch = fine[fine.group == "charted"].sort_values("score", ascending=False)
    bar = float(ch.score.median()) if len(ch) else 8.0
    globals()["BAR"] = bar
    shaped = un[un.score >= bar]
    if hand:
        picked = un.id.isin([k for k, v in hand.items() if v.get("verdict") in ("ship-like", "maybe")])
        auto = (un.crisp_ratio >= 5) & ~un.id.isin(list(hand)) & (un.nodata_frac < 0.3)
        short = un[picked | auto].sort_values("score", ascending=False)
    else:
        short = un.head(12)

    if os.environ.get("NO_WEB") == "1":
        print("charted median", bar, "uncharted", len(un), "shaped", len(shaped), "charted", len(ch)); sys.exit()
    os.makedirs(os.path.join(WEB, "hf"), exist_ok=True)
    ALLID = {rid: f"A{i:03d}" for i, rid in enumerate(fine.sort_values("score", ascending=False).id, 1)}
    def card(r, i, kind):
        lid = f"{'L' if kind == 'lead' else 'K'}{i:02d}"
        json.dump(heightfield(r.id, r, (hand.get(r.id) or {}).get("frame")), open(os.path.join(WEB, "hf", lid + ".json"), "w"))
        return {
            "id": lid, "all_id": ALLID.get(r.id), "rank": i, "verdict": "charted" if kind == "known" else verdict(r),
            "headline": r.note_hand if isinstance(r.note_hand, str) and r.note_hand else headline(r),
            "depth_m": round(r.depth_fine_m, 1), "length_m": round(r.length_m, 1), "width_m": round(r.width_m, 1),
            "height_m": round(r.height_m, 1), "heading_deg": round(r.heading_deg), "max_slope_deg": round(r.max_slope),
            "nearest_charted_km": round(float(r.known_dist_m) / 1000, 1) if pd.notna(r.known_dist_m) else None,
            "survey_year": None, "score": round(r.score, 1), "score_max": 12,
            "score_parts": r.parts, "pulled_down": pulled_down(r.parts), "heightfield": f"{URL}/hf/{lid}.json",
            "where": where(ctx, r.ox, r.oy),
            **(identity(r) if kind == "known" else {}),
        }
    def identity(r):
        a, _ = nearest(ctx["awois"], r.ox, r.oy, 300)
        e, _ = nearest(ctx["enc_wrecks"], r.ox, r.oy, 200)
        named = a and a["name"].strip().upper() not in ("UNKNOWN", "NAN", "", "WRECK", "OBSTRUCTION", "WRECKAGE", "UNIDENTIFIED")
        return {"name": a["name"].title() if named else "Unnamed wreck",
                "chart_category": (e or {}).get("cat"), "chart_note": (e or {}).get("inform"),
                "charted_year": int(e["sordat"]) if e and e.get("sordat") and e["sordat"].isdigit() else None,
                "vessel": {"name": a["name"].title(), "sunk": a["sunk"], "reported": reported_year(a["history"]), "story": story(a["history"])} if named else None}
    leads = [card(r, i, "lead") for i, r in enumerate(short.itertuples(), 1)]
    ch_named = ch.assign(_n=[1 if (nearest(ctx["awois"], r.ox, r.oy, 300)[0] or {}).get("name", "UNKNOWN") not in ("UNKNOWN", "nan", "WRECK", "OBSTRUCTION", "WRECKAGE") else 0 for r in ch.itertuples()])
    known = [card(r, i, "known") for i, r in enumerate(ch_named.sort_values(["_n", "score"], ascending=False).head(6).itertuples(), 1)]
    f = FN
    rc = json.load(open(f"{OUTA}/recall_scan_coarse.json")) if os.path.exists(f"{OUTA}/recall_scan_coarse.json") else json.load(open(f"{OUTA}/recall_implant.json"))
    rc = rc if "visible_over_1m" in rc else {"visible_over_1m": rc["planted"], "found_visible": rc["found"], "note": f"No known wreck lies in this survey, so we planted {rc['planted']} fake hulls (15-80 m, 1.2-4 m tall) in the real seabed"}
    surveys = int(todo.sid.str.split("_").str[0].nunique())
    hunt = {
        "sample": False,
        "status": os.environ.get("STATUS", "done"),
        "generated_at": datetime.now(timezone(timedelta(hours=7))).isoformat(timespec="seconds"),
        "area": {"key": AREA, "source": CFG.get("source", "NOAA"), "name": CFG["name"].replace(", VA", ", Virginia"), "seabed_km2": f["seabed_km2"], "sonar_km2": f["modern_km2"], "tiles": f["tiles"], "surveys": int(surveys), "survey_years": CFG.get("years", [2003, 2026])},
        "funnel": [
            {"stage": "Seabed mapped by sonar", "count": f["modern_km2"], "unit": "km²"},
            {"stage": "Bumps over 1 m tall", "count": f["bumps"], "unit": "bumps"},
            {"stage": "Not on any chart", "count": f["uncharted"], "unit": "bumps"},
            {"stage": f"Looked at up close at {CFG.get('closeup', '0.5-1 m')}", "count": int(sum(os.path.exists(f"{OUTA}/fine/{i}.npz") for i in todo[todo.group == "uncharted"].id)), "unit": "bumps"},
            {"stage": "Shortlisted after a look", "count": len(leads), "unit": "leads"},
        ],
        "recall": {"charted_wrecks_visible": rc["visible_over_1m"], "found": rc["found_visible"], "note": rc.get("note", "Charted wrecks the scanner re-found, proof it can see wrecks")},
        "charted_score_median": round(bar, 1),
        "leads": leads, "known": known,
        "progress": progress(),
        "map": {"w_km": ctx["w_km"], "h_km": ctx["h_km"], "land": ctx["land"], "places": [{k: p[k] for k in ("name", "x", "y")} for p in ctx["places"]], "locator": CFG.get("locator", {"lon": -76, "lat": 37})},
        "dropped_on_old_wreck_list": int(on_list.sum()),
        "dropped_inside_charted_area": int(in_area.sum()),
    }
    tb = Transformer.from_crs(PROJ, 4326, always_xy=True)
    WHERE = {}
    def spot(webid, r):
        lon, lat = tb.transform(r.ox, r.oy)
        near = []
        for a in ctx["awois"]:
            d = float(np.hypot(a["ux"] - r.ox, a["uy"] - r.oy))
            if d <= 5000:
                lo, la = tb.transform(a["ux"], a["uy"])
                nm = a["name"].title() if a["name"].strip().upper() not in ("UNKNOWN", "NAN", "", "WRECK", "OBSTRUCTION") else None
                near.append({"kind": "old wreck list" if "Wreck" in a["type"] else "old obstruction list", "name": nm, "sunk": a["sunk"], "lat": round(la, 6), "lon": round(lo, 6), "dist_m": round(d)})
        for e in ctx["enc_wrecks"]:
            d = float(np.hypot(e["ux"] - r.ox, e["uy"] - r.oy))
            if d <= 5000:
                lo, la = tb.transform(e["ux"], e["uy"])
                near.append({"kind": "charted wreck", "name": None, "category": e["cat"], "lat": round(la, 6), "lon": round(lo, 6), "dist_m": round(d)})
        WHERE[webid] = {"lat": round(lat, 6), "lon": round(lon, 6), "depth_m": round(r.depth_fine_m, 1), "nearby": sorted(near, key=lambda x: x["dist_m"])[:60]}
    for i, r in enumerate(short.itertuples(), 1):
        spot(f"L{i:02d}", r)
    for i, r in enumerate(ch_named.sort_values(["_n", "score"], ascending=False).head(6).itertuples(), 1):
        spot(f"K{i:02d}", r)
    if os.environ.get("ALL") == "1":
        for i, r in enumerate(fine.sort_values("score", ascending=False).itertuples(), 1):
            spot(f"A{i:03d}", r)
    json.dump(WHERE, open(f"{OUTA}/private/where.json", "w"))
    if os.environ.get("NO_WEB") != "1":
        json.dump(hunt, open(os.path.join(WEB, "hunt.json"), "w"), indent=1)
    if os.environ.get("ALL") == "1":
        os.makedirs(os.path.join(WEB, "hf", "all"), exist_ok=True)
        GROUP = {"uncharted": "Not charted", "charted": "Charted wreck", "in_charted_area": "Inside a charted reef or obstruction area", "on_old_list": "On NOAA's old wreck list"}
        items = []
        for i, r in enumerate(fine.sort_values("score", ascending=False).itertuples(), 1):
            aid = f"A{i:03d}"
            json.dump(heightfield(r.id, r, (hand.get(r.id) or {}).get("frame")), open(os.path.join(WEB, "hf", "all", aid + ".json"), "w"))
            hv = (hand.get(r.id) or {}).get("verdict")
            items.append({
                "id": aid, "rank": i, "group": r.group, "group_label": GROUP.get(r.group, r.group),
                "my_verdict": hv or ("charted" if r.group == "charted" else ("in_area" if r.group == "in_charted_area" else None)),
                "headline": r.note_hand if isinstance(r.note_hand, str) and r.note_hand else headline(r),
                "depth_m": round(r.depth_fine_m, 1), "length_m": round(r.length_m, 1), "width_m": round(r.width_m, 1),
                "height_m": round(r.height_m, 1), "heading_deg": round(r.heading_deg), "max_slope_deg": round(r.max_slope),
                "sharpness_x": round(float(r.crisp_ratio), 1), "scour_m": round(float(r.scour_m), 1), "others": int(r.others),
                "score": round(r.score, 1), "score_max": 12, "score_parts": r.parts, "pulled_down": pulled_down(r.parts),
                "heightfield": f"{URL}/hf/all/{aid}.json", "where": where(ctx, r.ox, r.oy),
                **(identity(r) if r.group == "charted" else {}),
            })
        json.dump({"generated_at": hunt["generated_at"], "charted_score_median": hunt["charted_score_median"], "count": len(items),
                   "groups": {g: sum(1 for x in items if x["group"] == g) for g in GROUP}, "items": items},
                  open(os.path.join(WEB, "all.json"), "w"))
        json.dump({it["id"]: fine.sort_values("score", ascending=False).iloc[it["rank"] - 1].id for it in items}, open(f"{OUTA}/private/all_ids.json", "w"))
        print("all", len(items))
    print(json.dumps({k: hunt[k] for k in ["funnel", "recall", "charted_score_median"]}, indent=1))
    print(len(leads), "leads", len(known), "known")
