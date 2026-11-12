import json, os, numpy as np, pandas as pd, geopandas as gpd
from areas import OUTA
w = pd.read_csv(f"{OUTA}/private/charted_wreck_relief.csv")
w = gpd.GeoDataFrame(w, geometry=gpd.points_from_xy(w.x, w.y), crs=32618)
w = w.loc[~w.geometry.apply(lambda g: (round(g.x, -1), round(g.y, -1))).duplicated()]
b = pd.read_csv(f"{OUTA}/private/all_bumps_{os.environ.get('SCAN', 'scan_v2')}.csv")
b = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.lon, b.lat), crs=4326).to_crs(32618)
j = gpd.sjoin_nearest(w, b[["id", "geometry"]], how="left", distance_col="d").groupby(level=0).d.min()
w["found"] = j <= 150
vis = w[w.max_relief_100m > 1]
r = {"charted_wrecks_in_sonar": int(len(w)), "visible_over_1m": int(len(vis)), "found_visible": int(vis.found.sum()), "found_all": int(w.found.sum())}
print(r); print(vis.groupby("why").found.agg(["sum", "count"]))
json.dump(r, open(f"{OUTA}/recall_{os.environ.get('SCAN', 'scan_v2')}.json", "w"))
