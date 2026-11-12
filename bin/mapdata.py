import csv, json, re
import pyogrio
from areas import DATA, OUTA

D = DATA + "/"
OUT = OUTA + "/private/map.json"
CATWRK = {1: "non-dangerous wreck", 2: "dangerous wreck", 3: "distributed remains", 4: "wreck showing mast", 5: "hull showing"}
pts, seen = [], set()


def add(kind, lat, lon, name, cat):
    key = (kind, round(lat, 5), round(lon, 5))
    if key in seen:
        return
    seen.add(key)
    pts.append([round(lat, 6), round(lon, 6), kind, name or None, cat or None])


g = pyogrio.read_dataframe(D + "known_enc.gpkg", layer="known_enc")
areas = []
for _, r in g.iterrows():
    k = r["kind"]
    name = r["OBJNAM"] if isinstance(r["OBJNAM"], str) else None
    if r.geometry.geom_type == "Point":
        if k == "WRECKS":
            c = r["CATWRK"]
            add("charted wreck", r.geometry.y, r.geometry.x, name, CATWRK.get(int(c)) if c == c else None)
        else:
            add("obstruction", r.geometry.y, r.geometry.x, name, "rock awash" if k == "UWTROC" else None)
    elif r.geometry.geom_type == "Polygon":
        poly = r.geometry.simplify(0.00005)
        if poly.is_empty:
            continue
        areas.append({"kind": "wreck area" if k == "WRECKS" else "obstruction area", "name": name,
                      "ring": [[round(y, 5), round(x, 5)] for x, y in poly.exterior.coords]})

for r in csv.DictReader(open(D + "awois.csv", encoding="utf-8")):
    try:
        lat, lon = float(r["LATDEC"]), float(r["LONDEC"])
    except ValueError:
        continue
    t = r["FEATURE_TYPE"]
    nm = r["VESSLTERMS"].strip()
    nm = None if nm.upper() in ("", "UNKNOWN") else nm.title()
    add("old wreck list" if t.startswith("Wreck") else "old obstruction list", lat, lon, nm, t)

json.dump({"known": pts, "areas": areas}, open(OUT, "w"), separators=(",", ":"))
print(len(pts), len(areas))
