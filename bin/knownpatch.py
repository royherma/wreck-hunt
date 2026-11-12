import glob, json, os
import pandas as pd, geopandas as gpd
from areas import DATA, OUTA, PROJ
import fine

WITHIN = float(os.environ.get("WITHIN_M", "150"))
CAP = int(os.environ.get("CAP", "60"))

if __name__ == "__main__":
    k = pd.concat([gpd.read_file(f"{DATA}/{f}") for f in ("known_enc.gpkg", "known.gpkg") if os.path.exists(f"{DATA}/{f}")])
    if "kind" in k.columns:
        k = k[k.kind.fillna("WRECKS") == "WRECKS"]
    kp = gpd.GeoDataFrame(geometry=gpd.GeoSeries(k.geometry.representative_point(), crs=4326).to_crs(PROJ).values, crs=PROJ)
    kp["wreck"] = range(len(kp))
    rows = []
    for f in sorted(glob.glob(f"{OUTA}/bag_scan/*.json")):
        b = pd.DataFrame(json.load(open(f)))
        if b.empty or "lon" not in b:
            continue
        g = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.lon, b.lat), crs=4326).to_crs(PROJ)
        j = gpd.sjoin_nearest(g, kp, distance_col="known_dist_m", max_distance=WITHIN)
        j["bag"] = os.path.basename(f)[:-5]
        rows.append(j)
    if not rows:
        print("no charted wrecks in the sonar"); raise SystemExit
    c = pd.concat(rows).sort_values("height_m", ascending=False).drop_duplicates("wreck").head(CAP)
    c["id"] = "K" + c.id.str.replace(r"[^A-Za-z0-9-]", "", regex=True)
    done = {o["id"] for o in json.load(open(f"{OUTA}/fine_local.json"))} if os.path.exists(f"{OUTA}/fine_local.json") else set()
    c = c[~c.id.isin(done)]
    print(f"{len(c)} charted wrecks to close up", flush=True)
    idx = f"{OUTA}/private/local_bumps.csv"
    pd.concat([pd.read_csv(idx), c[["id", "lon", "lat", "known_dist_m", "depth_m"]]]).drop_duplicates("id").to_csv(idx, index=False)
    todo = f"{OUTA}/private/fine_todo.csv"
    pd.concat([pd.read_csv(todo), pd.DataFrame({"id": c.id, "group": "charted", "sid": c.bag.str[:-4]})]).drop_duplicates("id").to_csv(todo, index=False)
    out = []
    for bag, grp in c.groupby("bag"):
        out += fine.run_chunk((f"{DATA}/bags/{bag}", grp.to_dict("records")))
        print(f"{bag}: {len(out)}/{len(c)}", flush=True)
    dst = f"{OUTA}/fine_local.json"
    json.dump((json.load(open(dst)) if os.path.exists(dst) else []) + out, open(dst, "w"))
    print(f"OK {sum('err' not in o for o in out)} charted close-ups", flush=True)
