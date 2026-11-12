import glob, json, os, sys, xml.etree.ElementTree as ET
from multiprocessing import Pool
import numpy as np, rasterio
from rasterio.warp import transform as warp_xy
from scipy import ndimage as ndi
from skimage.measure import label, regionprops

from areas import ROOT, DATA, OUTA
COARSE = os.environ.get("COARSE") == "1"
OUT = os.path.join(OUTA, "scan_coarse" if COARSE else "scan_v2")
MIN_LEN = 0 if COARSE else 12
MIN_AREA = 1 if COARSE else 6
SONAR_ONLY = True
MIN_DEPTH = 3.0
PX = 4.0
OPEN_PX = 25
MIN_RELIEF = 1.0
MIN_YEAR = 2000


def good_contributors(aux):
    rat = ET.parse(aux).getroot().find(".//GDALRasterAttributeTable")
    names = [d.find("Name").text for d in rat.findall("FieldDefn")]
    good, sig = set(), set()
    for r in rat.findall("Row"):
        d = dict(zip(names, [x.text for x in r.findall("F")]))
        sid = d.get("source_survey_id") or ""
        year = int((d.get("survey_date_start") or "0000")[:4] or 0)
        inst = d.get("source_institution") or ""
        sonar = "OCS" in inst or "Hydrographic" in inst
        if d.get("bathy_coverage") == "1" and ".interpolated" not in sid and year >= MIN_YEAR and (sonar or not SONAR_ONLY):
            good.add(float(d["value"]))
            if d.get("significant_features") == "1":
                sig.add(float(d["value"]))
    return good, sig, {float(r.find("F").text): None for r in rat.findall("Row")}


def scan(tif):
    try:
        return _scan(tif)
    except Exception as e:
        return f"BAD {os.path.basename(tif)} {type(e).__name__}"


def _scan(tif):
    name = os.path.basename(tif).split("_")[1]
    dst = os.path.join(OUT, name + ".json")
    if os.path.exists(dst):
        return name
    good, sig, _ = good_contributors(tif + ".aux.xml")
    with rasterio.open(tif) as r:
        z = r.read(1).astype("float32")
        c = r.read(3)
        tr, crs = r.transform, r.crs
    valid = np.isfinite(z)
    ok = valid & np.isin(c, list(good)) if good else np.zeros_like(valid)
    res = {"tile": name, "valid_km2": float(valid.sum() * PX * PX / 1e6), "good_km2": float(ok.sum() * PX * PX / 1e6), "cands": []}
    if ok.sum() < 1000:
        json.dump(res, open(dst, "w")); return name
    idx = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    zf = z[tuple(idx)]
    seabed = ndi.grey_opening(zf, size=(OPEN_PX, OPEN_PX))
    relief = zf - seabed
    gy, gx = np.gradient(zf, PX)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    rough = ndi.uniform_filter(relief, 15)
    edge = ndi.binary_dilation(~ok, iterations=2)
    lab = label((relief > MIN_RELIEF) & ok)
    for p in regionprops(lab, intensity_image=relief):
        if p.area < MIN_AREA or p.area > 1000:
            continue
        rr, cc = p.coords[:, 0], p.coords[:, 1]
        if edge[rr, cc].any():
            continue
        length = p.axis_major_length * PX
        width = max(p.axis_minor_length * PX, PX)
        height = float(p.intensity_max)
        if -np.nanmax(z[rr, cc]) < MIN_DEPTH:
            continue
        if not (MIN_LEN <= length <= 300 and width <= 60 and 1.0 <= height <= 20):
            continue
        r0, c0 = map(int, p.centroid)
        win_rel = relief[max(r0-40,0):r0+40, max(c0-40,0):c0+40]
        win_lab = lab[max(r0-40,0):r0+40, max(c0-40,0):c0+40]
        bg = win_rel[(win_lab == 0)]
        bg_noise = float(np.percentile(bg, 95)) if bg.size else 0.0
        neighbours = len(set(np.unique(win_lab)) - {0, p.label})
        x, y = tr * (c0 + 0.5, r0 + 0.5)
        lon, lat = warp_xy(crs, "EPSG:4326", [x], [y])
        res["cands"].append({
            "id": f"{name}-{r0}-{c0}", "lat": lat[0], "lon": lon[0], "depth_m": float(-np.nanmax(z[rr, cc])),
            "length_m": round(length, 1), "width_m": round(width, 1), "height_m": round(height, 2),
            "area_m2": float(p.area * PX * PX), "max_slope": round(float(slope[rr, cc].max()), 1),
            "elong": round(length / width, 2), "bg_p95": round(bg_noise, 2), "neighbours": neighbours,
            "solidity": round(float(p.solidity), 2), "survey_sigfeat": bool(np.isin(c[rr, cc], list(sig)).any()),
            "contrib": float(np.bincount(c[rr, cc].astype(int)).argmax()),
        })
    json.dump(res, open(dst, "w"))
    return name


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    tifs = sorted(glob.glob(os.path.join(DATA, "tiles", "*.tiff")))
    if len(sys.argv) > 1:
        tifs = [t for t in tifs if any(a in t for a in sys.argv[1:])]
    with Pool(9) as pool:
        for n in pool.imap_unordered(scan, tifs):
            print("done", n, flush=True)
