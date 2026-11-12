import json, os, sys
import numpy as np, pandas as pd, geopandas as gpd
from areas import CFG, DATA, OUTA, PROJ
import fine

UTM = PROJ


def known_sets():
    k1 = gpd.read_file(f"{DATA}/known_enc.gpkg"); k2 = gpd.read_file(f"{DATA}/known.gpkg")
    k = pd.concat([k1[["geometry"]], k2[["geometry"]]])
    k = gpd.GeoDataFrame(k, crs=4326).to_crs(UTM)
    pts = k.geometry.representative_point()
    areas = k[k.geom_type.isin(["Polygon", "MultiPolygon"])].buffer(100).union_all()
    aw = pd.read_csv(f"{DATA}/awois.csv")
    awp = gpd.GeoSeries(gpd.points_from_xy(aw.LONDEC, aw.LATDEC), crs=4326).to_crs(UTM)
    return gpd.GeoDataFrame(geometry=pd.concat([pts, awp], ignore_index=True), crs=UTM), areas


if __name__ == "__main__":
    bag = os.path.abspath(sys.argv[1])
    name = os.path.basename(bag)
    cands = json.load(open(f"{OUTA}/bag_scan/{name}.json"))
    if not cands:
        print("no candidates"); sys.exit()
    c = pd.DataFrame(cands)
    g = gpd.GeoDataFrame(c, geometry=gpd.points_from_xy(c.lon, c.lat), crs=4326).to_crs(UTM)
    kp, areas = known_sets()
    near = gpd.sjoin_nearest(g, kp, how="left", distance_col="known_dist_m").groupby(level=0).known_dist_m.min()
    g["known_dist_m"] = near
    g["in_area"] = g.geometry.within(areas)
    KM = CFG.get("known_m", 250)
    keep = g[(g.known_dist_m > KM) & ~g.in_area]
    keep = keep.assign(_p=keep.height_m * (1 + (keep.neighbours <= 4)) * (1.5 - keep.bg_p95.clip(0, 1))).sort_values("_p", ascending=False)
    keep["id"] = "F" + keep.id.str.replace(r"[^A-Za-z0-9-]", "", regex=True)
    print(f"{name}: {len(c)} bumps, {int((g.known_dist_m <= KM).sum())} near charted, {int(g.in_area.sum())} in charted areas, {len(keep)} uncharted", flush=True)
    os.makedirs(f"{OUTA}/private", exist_ok=True)
    idx = f"{OUTA}/private/local_bumps.csv"
    rows = keep[["id", "lon", "lat", "known_dist_m", "depth_m"]]
    pd.concat([pd.read_csv(idx), rows]).drop_duplicates("id").to_csv(idx, index=False) if os.path.exists(idx) else rows.to_csv(idx, index=False)
    todo = f"{OUTA}/private/fine_todo.csv"
    t = pd.read_csv(todo) if os.path.exists(todo) else pd.DataFrame(columns=["id", "group", "sid"])
    t = pd.concat([t, pd.DataFrame({"id": keep.id, "group": "uncharted", "sid": name[:-4]})]).drop_duplicates("id")
    t.to_csv(todo, index=False)
    limit = int(os.environ.get("LIMIT", "2500"))
    recs = keep.head(limit).to_dict("records")
    out = []
    for i in range(0, len(recs), 200):
        out += fine.run_chunk((bag, recs[i:i + 200]))
        print(f"{name}: patches {len(out)}/{len(recs)}", flush=True)
    dst = f"{OUTA}/fine_local.json"
    prev = json.load(open(dst)) if os.path.exists(dst) else []
    json.dump(prev + out, open(dst, "w"))
    print(f"OK {name} {sum('err' not in o for o in out)} patches", flush=True)
