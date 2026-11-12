import glob, json, os
os.environ.setdefault("GDAL_CACHEMAX", "200")
import numpy as np, rasterio
from rasterio.warp import reproject, transform_bounds, Resampling
from rasterio.transform import from_bounds
from rasterio.crs import CRS
from PIL import Image
from scipy import ndimage as ndi
from areas import CFG, DATA, OUTA

LONG = int(os.environ.get("PX", "2400"))
ZLONG = 512
OUT = f"{OUTA}/private/sonar"


def sources():
    tiles = sorted(glob.glob(f"{DATA}/tiles/*.tif*"))
    tiles = [t for t in tiles if not t.endswith(".xml")]
    bags = sorted(glob.glob(f"{DATA}/bags/*.tif") + glob.glob(f"{DATA}/bags/*.bag"))
    return tiles if tiles else bags


def low(s, step):
    a = np.full((s.height // step + 1, s.width // step + 1), np.nan, "float32")
    for _, w in s.block_windows(1):
        blk = s.read(1, window=w).astype("float32")
        if s.nodata is not None:
            blk[blk == s.nodata] = np.nan
        r0, c0 = -(-w.row_off // step) * step - w.row_off, -(-w.col_off // step) * step - w.col_off
        sub = blk[r0::step, c0::step]
        R, C = (w.row_off + r0) // step, (w.col_off + c0) // step
        a[R:R + sub.shape[0], C:C + sub.shape[1]] = sub
    a[np.abs(a) > 1e4] = np.nan
    return a


if __name__ == "__main__":
    files = sources()
    srcs = [rasterio.open(f) for f in files]
    crs = [s.crs or CRS.from_epsg(CFG.get("utm", CFG.get("proj", 26918))) for s in srcs]
    bb = [transform_bounds(c, "EPSG:4326", *s.bounds) for s, c in zip(srcs, crs)]
    W, S, E, N = min(b[0] for b in bb), min(b[1] for b in bb), max(b[2] for b in bb), max(b[3] for b in bb)
    k = np.cos(np.deg2rad((S + N) / 2))
    if (E - W) * k >= N - S:
        w, h = LONG, max(1, int(LONG * (N - S) / ((E - W) * k)))
    else:
        h, w = LONG, max(1, int(LONG * (E - W) * k / (N - S)))
    dst_t = from_bounds(W, S, E, N, w, h)
    m_px = (E - W) * 111320 * k / w
    z = np.full((h, w), np.nan, "float32")
    for f, s, c in zip(files, srcs, crs):
        step = max(1, int(m_px / abs(s.res[0]) / 2))
        a = low(s, step)
        t = s.transform * s.transform.scale(step, step)
        d = np.full((h, w), np.nan, "float32")
        reproject(a, d, src_transform=t, src_crs=c, src_nodata=np.nan, dst_transform=dst_t, dst_crs="EPSG:4326", dst_nodata=np.nan, resampling=Resampling.average)
        z = np.where(np.isfinite(d), d, z)
        print(os.path.basename(f), "ok", flush=True)
        s.close()
    ok = np.isfinite(z)
    zf = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    gy, gx = np.gradient(zf * 8, m_px)
    sl, asp = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    hs = np.sin(0.7) * np.cos(sl) + np.cos(0.7) * np.sin(sl) * np.cos(np.deg2rad(315) - asp)
    lo, hi = np.nanpercentile(hs[ok], [1, 99.5])
    hs = ((hs - lo) / max(hi - lo, 1e-6)).clip(0, 1)
    d0, d1 = np.nanpercentile(-z[ok], [2, 98])
    t = ((-zf - d0) / max(d1 - d0, 0.5)).clip(0, 1)
    shallow, deep = np.array([0.86, 0.93, 0.95]), np.array([0.20, 0.42, 0.58])
    base = shallow[None, None] * (1 - t[..., None]) + deep[None, None] * t[..., None]
    rgb = (base * (0.55 + 0.6 * hs[..., None])).clip(0, 1)
    rgb[~ok] = 1.0
    rgba = np.dstack([(rgb * 255).astype(np.uint8), (ok * 255).astype(np.uint8)])
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(f"{OUT}/sonar.png", optimize=True)
    f = max(1, int(np.ceil(max(w, h) / ZLONG)))
    zh, zw = h // f, w // f
    with np.errstate(all="ignore"):
        zg = np.nanmean((-z[:zh * f, :zw * f]).reshape(zh, f, zw, f), axis=(1, 3)).astype("<f4")
    zg.tofile(f"{OUT}/sonar_z.bin")
    json.dump({"bounds": [W, S, E, N], "w": w, "h": h, "m_per_px": round(m_px, 1), "zw": zw, "zh": zh, "zb": [W, N - zh * f * (N - S) / h, W + zw * f * (E - W) / w, N], "depth_m": [round(float(d0), 1), round(float(d1), 1)],
               "km2": round(float(ok.sum()) * m_px * m_px / 1e6), "files": len(files)}, open(f"{OUT}/sonar.json", "w"))
    print("OK", w, h, round(m_px, 1), "m/px", f"{OUT}/sonar.png")
