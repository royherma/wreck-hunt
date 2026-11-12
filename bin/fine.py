import glob, json, os, sys, time, xml.etree.ElementTree as ET
from multiprocessing import Pool
import numpy as np, pandas as pd, rasterio
from rasterio.windows import Window
from rasterio.warp import transform as warp_xy
from scipy import ndimage as ndi
from skimage.measure import label, regionprops
from areas import DATA, OUTA

BAG_CRS = "EPSG:26918"
HALF_M = int(os.environ.get("HALF_M", "120"))
OPEN_M = 80
REL = 0.8
OUT = os.path.join(OUTA, "fine")
ENV = dict(GDAL_HTTP_MAX_RETRY=4, GDAL_HTTP_RETRY_DELAY=5, CPL_VSIL_CURL_CHUNK_SIZE=524288, GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT=90, GDAL_HTTP_CONNECTTIMEOUT=30)


def contributors():
    m = {}
    for f in glob.glob(f"{DATA}/tiles/*.aux.xml"):
        rat = ET.parse(f).getroot().find(".//GDALRasterAttributeTable")
        names = [d.find("Name").text for d in rat.findall("FieldDefn")]
        for r in rat.findall("Row"):
            d = dict(zip(names, [x.text for x in r.findall("F")]))
            m[float(d["value"])] = d
    return m


def bag_url(sid):
    h = int(sid[1:6])
    rng = "H10001-H12000" if h <= 12000 else "H12001-H14000"
    return f"https://data.ngdc.noaa.gov/platforms/ocean/nos/coast/{rng}/{sid[:6]}/BAG/{sid}.bag"


def features(z, cell):
    ok = np.isfinite(z)
    if ok.mean() < 0.6:
        return None, None
    idx = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    zf = z[tuple(idx)]
    rel = zf - ndi.grey_opening(zf, size=(int(OPEN_M / cell),) * 2)
    lab = label(rel > REL)
    c = z.shape[0] // 2
    rad = int(30 / cell)
    win = np.where(lab[c - rad:c + rad, c - rad:c + rad] > 0, rel[c - rad:c + rad, c - rad:c + rad], -1)
    if win.max() <= REL:
        return {"blob": False}, zf
    i, j = np.unravel_index(np.argmax(win), win.shape)
    target = lab[c - rad + i, c - rad + j]
    p = [q for q in regionprops((lab == target).astype(int), intensity_image=rel)][0]
    gy, gx = np.gradient(zf, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    ring = ndi.binary_dilation(lab == target, iterations=2) & ~(lab == target)
    others = [q for q in regionprops(lab) if q.label != target and q.area * cell * cell >= 20]
    L, W = p.axis_major_length * cell, max(p.axis_minor_length * cell, cell)
    return {
        "blob": True, "length_m": round(L, 1), "width_m": round(W, 1), "height_m": round(float(p.intensity_max), 2),
        "area_m2": round(float(p.area * cell * cell), 1), "solidity": round(float(p.solidity), 2),
        "fill": round(float(p.area / max(L * W / cell / cell, 1)), 2), "elong": round(L / W, 2),
        "edge_slope": round(float(np.median(slope[ring])), 1), "max_slope": round(float(slope[p.coords[:, 0], p.coords[:, 1]].max()), 1),
        "heading_deg": round(float(np.degrees(-p.orientation)) % 180, 1), "others": len(others),
        "others_area_m2": round(float(sum(q.area for q in others) * cell * cell), 1),
        "bg_p95": round(float(np.percentile(rel[(lab == 0) & ok], 95)), 2),
        "cy": float(p.centroid[0]), "cx": float(p.centroid[1]),
    }, zf


def run_chunk(args):
    url, rows = args
    out = []
    with rasterio.Env(**ENV):
        try:
            r = rasterio.open(url if url.startswith("/") else "/vsicurl/" + url)
        except Exception as e:
            return [{"id": x["id"], "err": f"open {type(e).__name__}"} for x in rows]
        res = abs(r.res[0])
        f = max(1, int(round(1.0 / res)))
        cell = res * f
        for x in rows:
            dst = os.path.join(OUT, x["id"] + ".npz")
            try:
                ex, ey = warp_xy("EPSG:4326", r.crs or BAG_CRS, [x["lon"]], [x["lat"]])
                col, row = ~r.transform * (ex[0], ey[0])
                half = int(HALF_M / res)
                a = r.read(1, window=Window(int(col) - half, int(row) - half, 2 * half, 2 * half), boundless=True, fill_value=r.nodata).astype("float32")
                a[(a == r.nodata) | (a > 100) | (a < -500)] = np.nan
                if f > 1:
                    n = (a.shape[0] // f) * f
                    with np.errstate(all="ignore"):
                        a = np.nanmean(a[:n, :n].reshape(n // f, f, n // f, f), axis=(1, 3))
                feat, zf = features(a, cell)
                if feat is None:
                    out.append({"id": x["id"], "err": "no data"}); continue
                centre = a[a.shape[0] // 2 - 5:a.shape[0] // 2 + 5, a.shape[1] // 2 - 5:a.shape[1] // 2 + 5]
                feat.update({"id": x["id"], "survey": url.rsplit("/", 1)[1][:-4], "cell_m": cell, "half_px": half,
                             "depth_fine_m": round(float(-np.nanmedian(a)), 2), "depth_coarse_m": x["depth_m"],
                             "centre_ok": bool(np.isfinite(centre).any())})
                np.savez_compressed(dst, z=a.astype("float32"), cell=cell)
                out.append(feat)
            except Exception as e:
                out.append({"id": x["id"], "err": f"{type(e).__name__}: {str(e)[:80]}"})
        r.close()
    return out


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    allb = pd.read_csv(f"{OUTA}/private/all_bumps_scan_coarse.csv")
    if os.environ.get("MODE") == "all":
        pick = allb[~allb.known].assign(group="uncharted")
        pick = pick.assign(_p=pick.height_m * (1 + (pick.neighbours <= 4)) * (1.5 - pick.bg_p95.clip(0, 1))).sort_values("_p", ascending=False)
    else:
        pick = allb[(~allb.known) & (allb.neighbours <= 4) & (allb.bg_p95 < 0.6)].assign(group="uncharted")
    ctl = allb[allb.known & allb.kind.astype(str).str.contains("WRECKS|Wreck") & (allb.known_dist_m <= 150)]
    ctl = ctl.sort_values("height_m", ascending=False).drop_duplicates("id").assign(group="charted")
    todo = pd.concat([pick, ctl]).drop_duplicates("id")
    C = contributors()
    todo["sid"] = todo.contrib.map(lambda v: (C.get(v) or {}).get("source_survey_id", ""))
    todo = todo[todo.sid.str.match(r"^H\d{5}_")]
    prev = pd.read_csv(f"{OUTA}/private/fine_todo.csv") if os.path.exists(f"{OUTA}/private/fine_todo.csv") else None
    merged = pd.concat([prev, todo[["id", "group", "sid"]]]).drop_duplicates("id") if prev is not None else todo[["id", "group", "sid"]]
    merged.to_csv(f"{OUTA}/private/fine_todo.csv", index=False)
    done = {os.path.basename(p)[:-4] for p in glob.glob(f"{OUT}/*.npz")}
    jobs = []
    for sid, g in todo.groupby("sid", sort=False):
        rows = [r for r in g.to_dict("records") if r["id"] not in done]
        for i in range(0, len(rows), 12):
            jobs.append((bag_url(sid), rows[i:i + 12]))
    if os.environ.get("MODE") == "all":
        rank = {r: i for i, r in enumerate(todo.id)}
        jobs.sort(key=lambda j: min(rank[x["id"]] for x in j[1]))
    print("patches", len(todo), "jobs", len(jobs), "surveys", todo.sid.nunique(), flush=True)
    res = []
    t = time.time()
    with Pool(int(os.environ.get("WORKERS", "16"))) as pool:
        for i, out in enumerate(pool.imap_unordered(run_chunk, jobs), 1):
            res += out
            print(f"chunk {i}/{len(jobs)} patches {len(res)} errors {sum('err' in o for o in res)} {int(time.time()-t)}s", flush=True)
    dst = f"{OUTA}/fine_all.json" if os.environ.get("MODE") == "all" else f"{OUTA}/fine.json"
    json.dump(res, open(dst, "w"))
    old = []
    print("DONE", len(old + res))
