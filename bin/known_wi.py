import json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import geopandas as gpd, pandas as pd
import os
from areas import DATA

REGION = os.environ.get("WI_REGION", "LakeSuperior")

BASE = "https://www.wisconsinshipwrecks.org"
UA = {"User-Agent": "wreck-hunt research script"}


def get(path):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(path)


def text(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"(?s)<script.*?</script>", " ", html))).replace("&nbsp;", " ").replace("&deg;", "°")


LABELS = ["Vessel Type", "Cargo Description", "Length", "Beam", "Depth of Hold", "Hull Material", "Gross Tonnage", "Propulsion Type", "Number of Masts", "Rig Type",
          "Vessel Location", "Body of Water", "County", "Nearest City", "Latitude", "Longitude", "Vessel Builder", "Registry Number", "Builder", "Year Built",
          "Location Built", "Owners", "Home Port", "Service History"]
STOP = "|".join(re.escape(l) for l in LABELS)


def field(t, name):
    m = re.search(rf"(?<![A-Za-z]){re.escape(name)}:?\s+(.*?)\s*(?:(?:{STOP}):|Service History|$)", t)
    return m.group(1).strip() if m else None


def detail(vid):
    t = text(get(f"/Vessel/Details/{vid}"))
    out = {"id": vid}
    for k, n in [("length_ft", "Length"), ("cargo", "Cargo Description"), ("county", "County"), ("city", "Nearest City"), ("built", "Year Built"), ("type", "Vessel Type"), ("tons", "Gross Tonnage")]:
        out[k] = field(t, n)
    m = re.search(r"Latitude:?\s*N\s*(\d+)\D+(\d+(?:\.\d+)?)\D*\s*Longitude:?\s*W\s*(\d+)\D+(\d+(?:\.\d+)?)", t)
    out["text_lat"], out["text_lon"] = (int(m.group(1)) + float(m.group(2)) / 60, -(int(m.group(3)) + float(m.group(4)) / 60)) if m else (None, None)
    m = re.search(r"valued at \$([\d,]+)", t)
    out["value_usd"] = int(m.group(1).replace(",", "")) if m else None
    i = t.find("Service History")
    out["story"] = t[i + 16:i + 2500].strip() if i >= 0 else ""
    return out


if __name__ == "__main__":
    pins, listed = {}, {}
    for reg in REGION.split(","):
        for r in re.findall(r"\{'Id': '(\d+)', 'Name': '([^']*)', 'VesselType': '([^']*)', 'CasualtyType': '[^']*', 'CasualtyDate': '([^']*)', 'GeoLat': '([^']*)', 'GeoLong': '([^']*)'", get("/Map/" + reg)):
            pins[r[0]] = {"name": r[1], "vtype": r[2], "lost": r[3], "lat": float(r[4]), "lon": float(r[5])}
        listed.update(dict(re.findall(r'href="/Vessel/Details/(\d+)\?region=' + reg + r'"[^>]*>\s*([^<]+?)\s*<', get("/vessel/" + reg))))
    ids = sorted(set(listed) | set(pins), key=int)
    with ThreadPoolExecutor(4) as ex:
        det = {d["id"]: d for d in ex.map(detail, ids)}
    rows = [{**det[i], "name": (pins.get(i) or {}).get("name") or listed.get(i), "lat": (pins.get(i) or {}).get("lat") or det[i]["text_lat"], "lon": (pins.get(i) or {}).get("lon") or det[i]["text_lon"],
             "lost_date": (pins.get(i) or {}).get("lost")} for i in ids]
    json.dump(rows, open(f"{DATA}/wi_shipwrecks.json", "w"), indent=1)
    p = pd.DataFrame([r for r in rows if r["lat"]])
    g = gpd.GeoDataFrame(p.drop(columns=["story"]), geometry=gpd.points_from_xy(p.lon, p.lat), crs=4326)
    g["layer"] = "Wisconsin Historical Society shipwreck"
    g.to_file(f"{DATA}/known.gpkg")
    print("listed", len(ids), "with position", len(g), "no position", len(ids) - len(g))
