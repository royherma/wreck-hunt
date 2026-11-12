import glob, json, os, sys
os.environ.setdefault("GDAL_CACHEMAX", "200")
os.environ["AREA"] = sys.argv[1]
import numpy as np, rasterio
from rasterio.windows import Window
from rasterio.warp import transform as warp_xy
from rasterio.crs import CRS
from scipy import ndimage as ndi
from areas import CFG, DATA, OUTA

rid, span = sys.argv[2], float(sys.argv[3])
N = 256 if rid.startswith("@") else 192
RAW = rid.startswith("@")
if RAW:
    la, lo = map(float, rid[1:].split(","))
    spot = {"lat": la, "lon": lo}
    dst = f"{OUTA}/private/patch/at_{la:.5f}_{lo:.5f}_{int(span)}.json"
else:
    spot = json.load(open(f"{OUTA}/private/where.json"))[rid]
    dst = f"{OUTA}/private/patch/{rid}_{int(span)}.json"


def read(path):
    with rasterio.open(path) as s:
        crs = s.crs or CRS.from_epsg(CFG.get("utm", CFG.get("proj", 26918)))
        xs, ys = warp_xy("EPSG:4326", crs, [spot["lon"]], [spot["lat"]])
        b = s.bounds
        if not (b.left < xs[0] < b.right and b.bottom < ys[0] < b.top):
            return None
        res = abs(s.res[0])
        col, row = ~s.transform * (xs[0], ys[0])
        half = int(span / 2 / res)
        n = min(2 * half, N * 4)
        a = s.read(1, window=Window(int(col) - half, int(row) - half, 2 * half, 2 * half), out_shape=(n, n), boundless=True, fill_value=s.nodata if s.nodata is not None else np.nan).astype("float32")
        if s.nodata is not None:
            a[a == s.nodata] = np.nan
        a[np.abs(a) > 1e4] = np.nan
        if not np.isfinite(a[n // 2 - 2:n // 2 + 2, n // 2 - 2:n // 2 + 2]).any():
            return None
        return res, a


if __name__ == "__main__":
    files = glob.glob(f"{DATA}/bags/*.tif") + glob.glob(f"{DATA}/bags/*.bag") + [t for t in glob.glob(f"{DATA}/tiles/*.tif*") if not t.endswith(".xml")]
    best = None
    for f in files:
        try:
            got = read(f)
        except Exception:
            continue
        if got and (best is None or got[0] < best[0]):
            best = got
    if best is None:
        print("no sonar here"); sys.exit(1)
    a = best[1]
    ok = np.isfinite(a)
    if not ok.all():
        a = a[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    w = ndi.zoom(a, N / a.shape[0], order=1)[:N, :N]
    if RAW:
        okn = ndi.zoom(ok.astype(float), N / ok.shape[0], order=0)[:N, :N] > 0.5
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        json.dump({"w": N, "h": N, "cell_m": round(span / N, 3), "span_m": span, "src_res_m": best[0], "lat": spot["lat"], "lon": spot["lon"],
                   "z": [round(float(-v), 2) if k else None for v, k in zip(w.ravel(), okn.ravel())]}, open(dst, "w"))
        print("OK", dst); sys.exit()
    yy, xx = np.mgrid[:N, :N]
    edge = np.zeros_like(w, bool); edge[:8] = edge[-8:] = True; edge[:, :8] = edge[:, -8:] = True
    coef, *_ = np.linalg.lstsq(np.c_[xx[edge], yy[edge], np.ones(edge.sum())], w[edge], rcond=None)
    w = w - (coef[0] * xx + coef[1] * yy + coef[2])
    w = w - np.median(w)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    json.dump({"w": N, "h": N, "cell_m": round(span / N, 3), "span_m": span, "src_res_m": best[0],
               "gap_share": round(float(1 - ok.mean()), 3), "z": [round(float(v), 2) for v in w.ravel()]}, open(dst, "w"))
    print("OK", dst)
