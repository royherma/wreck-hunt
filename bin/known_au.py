import json, urllib.parse, urllib.request
import geopandas as gpd, pandas as pd
from areas import CFG, DATA

URL = "https://gis.environment.gov.au/gispub/rest/services/heritage/shipwrecks_query/MapServer/32/query"
FIELDS = "VESSEL_NAME,LATITUDE,LONGITUDE,YEAR_WRECKED,YEAR_BUILT,VESSEL_TYPE_DESC,GROSS_TONNAGE,WHERE_LOST,MCH_TYPE_CODE,MCH_ID"

if __name__ == "__main__":
    x0, y0, x1, y1 = CFG["bbox"]
    pad = 0.1
    where = f"LATITUDE > {y0 - pad} AND LATITUDE < {y1 + pad} AND LONGITUDE > {x0 - pad} AND LONGITUDE < {x1 + pad}"
    q = urllib.parse.urlencode({"where": where, "outFields": FIELDS, "returnGeometry": "false", "f": "json"})
    with urllib.request.urlopen(f"{URL}?{q}", timeout=60) as r:
        d = json.load(r)
    rows = [f["attributes"] for f in d["features"]]
    p = pd.DataFrame(rows)
    g = gpd.GeoDataFrame(p, geometry=gpd.points_from_xy(p.LONGITUDE, p.LATITUDE), crs=4326)
    g["name"] = g.VESSEL_NAME.str.title()
    g["layer"] = "Australian National Shipwreck Database shipwreck"
    g.to_file(f"{DATA}/known.gpkg")
    aw = pd.DataFrame({"RECRD": g.MCH_ID, "VESSLTERMS": g.VESSEL_NAME, "FEATURE_TYPE": "Wreck - Australian National Shipwreck Database", "LATDEC": g.LATITUDE, "LONDEC": g.LONGITUDE,
                       "YEARSUNK": g.YEAR_WRECKED, "HISTORY": (g.WHERE_LOST.fillna("") + " " + g.VESSEL_TYPE_DESC.fillna("") + " " + g.GROSS_TONNAGE.astype(str) + " t").str.strip()})
    aw.to_csv(f"{DATA}/awois.csv", index=False)
    empty = gpd.GeoDataFrame({"kind": pd.Series(dtype=str)}, geometry=gpd.GeoSeries([], crs=4326))
    import os
    if not os.path.exists(f"{DATA}/known_enc.gpkg"):
        empty.to_file(f"{DATA}/known_enc.gpkg")
    print("wrecks", len(g))
