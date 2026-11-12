import json, re, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
import geopandas as gpd, pandas as pd
from areas import DATA

NOAA = "https://thunderbay.noaa.gov"
UA = {"User-Agent": "wreck-hunt research script"}
PRESERVES = ["https://www.michiganpreserves.org/thunder-bay-underwater-preserve/",
             "https://www.michiganpreserves.org/thunder-bay-underwater-preserve/thunder-bay-sanctuary-expanded-northern-section/",
             "https://www.michiganpreserves.org/thunder-bay-underwater-preserve/thunder-bay-inner-bay-near-alpena-and-south-shore/"]
COORD = r"N\s*(\d+)\s*[°º]\s*([\d.]+)\D{0,12}?W\s*(\d+)\s*[°º]\s*([\d.]+)"


def get(url):
    for a in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(2 * (a + 1))
    return ""


def text(h):
    h = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", " ", h)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h)).replace("&#8242;", "'").replace("&amp;", "&")


def dm(m):
    return int(m[0]) + float(m[1]) / 60, -(int(m[2]) + float(m[3]) / 60)


def noaa_page(path):
    h = get(NOAA + path)
    t = text(h)
    m = re.search(r"GPS Location:?\s*" + COORD, t)
    title = re.search(r"<title>([^<|]*)", h)
    f = lambda k: (re.search(k + r":\s*(.*?)(?=\s+[A-Z][A-Za-z ]{3,22}:|$)", t) or [None, None])[1]
    row = {"name": (title.group(1).strip() if title else path), "path": path, "type": f("Vessel Type"), "depth": f("Depth"), "length": f("Wreck Length")}
    if m:
        row["lat"], row["lon"] = dm(m.groups())
    return row


if __name__ == "__main__":
    idx = get(NOAA + "/shipwrecks/")
    paths = sorted(set(re.findall(r'href="(/shipwrecks/[^"]+\.html)"', idx)))
    with ThreadPoolExecutor(4) as ex:
        rows = list(ex.map(noaa_page, paths))
    for r in rows:
        r["src"] = "NOAA TBNMS"
    pres = []
    for u in PRESERVES:
        t = text(get(u))
        i = max(t.find("Wreck Name"), 0)
        prev = i
        for m in re.finditer(COORD, t[i:]):
            seg = t[prev:i + m.start()]
            seg = re.sub(r"^.*?GPS/LAT/LON", "", seg) if "GPS/LAT/LON" in seg else seg
            seg = re.sub(r"[\d,]+'?\s*(?:ft|feet)?\s*$", "", seg.strip()).strip()
            seg = re.sub(r"^(?:Depth\s*)", "", seg)
            lat, lon = dm(m.groups())
            pres.append({"name": re.sub(r"\s+", " ", seg)[:60], "lat": lat, "lon": lon, "src": "Michigan Preserves"})
            prev = i + m.end()
    allr = rows + pres
    p = pd.DataFrame([r for r in allr if "lat" in r and not pd.isna(r["lat"])])
    p = p[(p.lat.between(44.3, 45.6)) & (p.lon.between(-83.9, -82.5))]
    g = gpd.GeoDataFrame(p, geometry=gpd.points_from_xy(p.lon, p.lat), crs=4326)
    g["layer"] = "Thunder Bay NMS / Michigan Preserves wreck list"
    g.to_file(f"{DATA}/known.gpkg")
    json.dump(allr, open(f"{DATA}/tbnms_wrecks.json", "w"), indent=1)
    print("noaa pages", len(rows), "with position", sum("lat" in r for r in rows), "preserves rows", len(pres), "kept", len(g))
