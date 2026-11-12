import glob, json, os
import numpy as np, pandas as pd, geopandas as gpd, rasterio
from rasterio.warp import transform as warp_xy
from scan import good_contributors

from areas import ROOT, DATA, OUTA
SCAN = os.environ.get("SCAN", "scan_v2")
KNOWN_M = 250
UTM = 32618

D = [json.load(open(f)) for f in glob.glob(f"{OUTA}/{SCAN}/*.json")]
c = pd.DataFrame([x for d in D for x in d["cands"]])
cg = gpd.GeoDataFrame(c, geometry=gpd.points_from_xy(c.lon, c.lat), crs=4326).to_crs(UTM)

k1 = gpd.read_file(f"{DATA}/known_enc.gpkg")
k2 = gpd.read_file(f"{DATA}/known.gpkg")
k = pd.concat([k1[["kind", "geometry"]], k2.assign(kind=k2.layer)[["kind", "geometry"]]], ignore_index=True)
k = gpd.GeoDataFrame(k, crs=4326).to_crs(UTM)
k["geometry"] = k.geometry.representative_point()

near = gpd.sjoin_nearest(cg, k[["kind", "geometry"]], how="left", distance_col="known_dist_m")
near = near.sort_values("known_dist_m").drop_duplicates("id")
cg = cg.merge(near[["id", "known_dist_m", "kind"]], on="id")
cg["known"] = cg.known_dist_m <= KNOWN_M

tiles = gpd.read_file(f"{DATA}/area_tiles.gpkg").to_crs(UTM)
wr = k[k.kind.str.contains("WRECKS|Wreck", regex=True)].copy()
wr = wr.loc[~wr.geometry.apply(lambda g: (round(g.x, -1), round(g.y, -1))).duplicated()]
wr = gpd.sjoin(wr, tiles[["tile", "geometry"]], how="inner").drop(columns="index_right")
in_cov = []
for t, grp in wr.groupby("tile"):
    tif = glob.glob(f"{DATA}/tiles/BlueTopo_{t}_*.tiff")
    if not tif:
        continue
    good, _, _ = good_contributors(tif[0] + ".aux.xml")
    with rasterio.open(tif[0]) as r:
        xs, ys = warp_xy(f"EPSG:{UTM}", r.crs, list(grp.geometry.x), list(grp.geometry.y))
        vals = [v[0] for v in r.sample(list(zip(xs, ys)), indexes=3)]
    for (i, row), v in zip(grp.iterrows(), vals):
        if v in good:
            in_cov.append(row.geometry)
cov = gpd.GeoDataFrame(geometry=in_cov, crs=UTM)
hit = gpd.sjoin_nearest(cov, cg[["geometry"]], how="left", distance_col="d")
hit = hit.groupby(level=0).d.min()
recall = {"charted_wrecks_in_modern_coverage": int(len(cov)), "found_within_150m": int((hit <= 150).sum())}

u = cg[~cg.known].copy()
u["isolated"] = u.neighbours <= 2
u["score"] = (
    np.clip(u.height_m / 4, 0, 1) * 3
    + np.clip((u.max_slope - 10) / 30, 0, 1) * 2
    + np.clip(1 - u.bg_p95 / 1.0, 0, 1) * 2
    + u.isolated * 2
    + np.clip(u.solidity, 0, 1)
    + ((u.elong >= 2) & (u.elong <= 8)) * 1
)
u = u.sort_values("score", ascending=False)
os.makedirs(f"{OUTA}/private", exist_ok=True)
u.drop(columns="geometry").to_csv(f"{OUTA}/private/unknown_ranked_{SCAN}.csv", index=False)
cg.drop(columns="geometry").to_csv(f"{OUTA}/private/all_bumps_{SCAN}.csv", index=False)
funnel = {
    "tiles": len(D), "seabed_km2": round(sum(d["valid_km2"] for d in D)), "modern_km2": round(sum(d["good_km2"] for d in D)),
    "bumps": int(len(cg)), "near_charted": int(cg.known.sum()), "uncharted": int(len(u)),
    "uncharted_isolated_steep": int(((u.isolated) & (u.max_slope >= 20) & (u.bg_p95 < 0.5)).sum()),
    "charted_features": int(len(k)), **recall,
}
json.dump(funnel, open(f"{OUTA}/funnel_{SCAN}.json", "w"), indent=1)
print(json.dumps(funnel, indent=1))
print(u.head(25)[["id", "depth_m", "length_m", "width_m", "height_m", "max_slope", "bg_p95", "neighbours", "elong", "survey_sigfeat", "known_dist_m", "score"]].to_string())
