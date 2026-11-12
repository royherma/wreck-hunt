import json, sys, urllib.request, urllib.parse
import geopandas as gpd, pandas as pd

from areas import CFG, DATA
BBOX = CFG["bbox"]
BASE = "https://encdirect.noaa.gov/arcgis/rest/services/encdirect"
KEEP = ("wreck", "obstruction", "underwater_awash_rock")

def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)

frames = []
for svc in ["enc_overview", "enc_general", "enc_coastal", "enc_approach", "enc_harbour", "enc_berthing"]:
    try:
        layers = get(f"{BASE}/{svc}/MapServer?f=json").get("layers", [])
    except Exception as e:
        print("skip", svc, e); continue
    for l in layers:
        if not any(k in l["name"].lower() for k in KEEP):
            continue
        off = 0
        while True:
            q = urllib.parse.urlencode({"where": "1=1", "geometry": ",".join(map(str, BBOX)), "geometryType": "esriGeometryEnvelope",
                 "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "outSR": 4326,
                 "f": "geojson", "resultOffset": off, "resultRecordCount": 1000})
            d = get(f"{BASE}/{svc}/MapServer/{l['id']}/query?{q}")
            feats = d.get("features", [])
            if feats:
                g = gpd.GeoDataFrame.from_features(feats, crs=4326)
                g["layer"] = f"{svc}:{l['name']}"
                frames.append(g)
            if len(feats) < 1000:
                break
            off += 1000
        print(svc, l["name"], sum(len(f) for f in frames if f["layer"].iloc[0] == f"{svc}:{l['name']}"))
allk = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=4326)
keep = [c for c in ["layer", "objnam", "OBJNAM", "catwrk", "CATWRK", "valsou", "VALSOU", "sorind", "SORIND", "geometry"] if c in allk.columns]
allk[keep].to_file(f"{DATA}/known.gpkg")
print("TOTAL", len(allk))
