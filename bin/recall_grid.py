import glob, json, os, sys
import numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.windows import Window
from areas import DATA, OUTA
from bagscan import relief_of, OPEN_M

R_M, HIT_M = 100, 150


def wrecks():
    k = []
    for f in glob.glob(f"{DATA}/known*.gpkg"):
        g = gpd.read_file(f)
        kind = g["kind"] if "kind" in g else g.get("layer", pd.Series("", index=g.index))
        g = g[kind.astype(str).str.contains("WRECKS|Wreck|shipwreck", case=False)]
        g = g.assign(name=g.get("name", g.get("OBJNAM", pd.Series(None, index=g.index))), src=os.path.basename(f))
        k.append(g[["name", "src", "geometry"]])
    k = gpd.GeoDataFrame(pd.concat(k, ignore_index=True), crs=4326)
    k["geometry"] = k.geometry.representative_point()
    return k


def check(grid, k, bumps, done):
    rows = []
    with rasterio.open(grid) as r:
        kk = k.to_crs(r.crs)
        bg = gpd.GeoDataFrame(bumps, geometry=gpd.points_from_xy(bumps.lon, bumps.lat), crs=4326).to_crs(r.crs)
        res = abs(r.res[0]); half = int((R_M + OPEN_M) / res)
        for i, w in kk.iterrows():
            if i in done:
                continue
            col, row = ~r.transform * (w.geometry.x, w.geometry.y)
            z = r.read(1, window=Window(int(col) - half, int(row) - half, 2 * half, 2 * half), boundless=True, fill_value=r.nodata).astype("float32")
            z[(z == r.nodata) | (z > 100)] = np.nan
            c = half; rr = int(R_M / res)
            covered = np.isfinite(z[c - 5:c + 5, c - 5:c + 5]).any()
            relief = None
            if np.isfinite(z).mean() > 0.3:
                _, rel, ok = relief_of(z, int(OPEN_M / res))
                relief = float(np.nanmax(np.where(ok, rel, np.nan)[c - rr:c + rr, c - rr:c + rr]))
            d = float(bg.distance(w.geometry).min()) if len(bg) else None
            if covered:
                done.add(i)
            rows.append({"idx": int(i), "name": w["name"], "src": w.src, "grid": os.path.basename(grid), "covered": bool(covered), "max_relief_100m": relief, "nearest_bump_m": d, "found": bool(d is not None and d <= HIT_M)})
    return rows


if __name__ == "__main__":
    bumps = pd.DataFrame([b for f in glob.glob(f"{OUTA}/bag_scan/*.json") for b in json.load(open(f))])
    k = wrecks()
    rows, done = [], set()
    for grid in sys.argv[1:]:
        rows += check(grid, k, bumps, done)
    d = pd.DataFrame(rows)
    d = d.sort_values("covered", ascending=False).drop_duplicates("idx").drop(columns="idx")
    os.makedirs(f"{OUTA}/private", exist_ok=True)
    d.to_csv(f"{OUTA}/private/known_wreck_recall.csv", index=False)
    vis = d[d.covered & (d.max_relief_100m > 1)]
    out = {"known_wrecks": len(d), "in_sonar": int(d.covered.sum()), "visible_over_1m": len(vis), "found_visible": int(vis.found.sum()), "found_all": int(d.found.sum())}
    json.dump(out, open(f"{OUTA}/recall_grid.json", "w"))
    print(d.to_string()); print(out)
