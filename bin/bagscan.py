import glob, json, os, sys
from multiprocessing import Pool
import numpy as np, rasterio
from rasterio.windows import Window
from rasterio.warp import transform as warp_xy
from scipy import ndimage as ndi
from skimage.measure import label, regionprops
from areas import DATA, OUTA

CELL = 1.0
OPEN_M = 80
MIN_RELIEF = 1.0
MIN_DEPTH = 3.0
BLOCK_M, PAD_M = 2000, 200
OUT = os.path.join(OUTA, "bag_scan")


def load_block(path, win, f):
    with rasterio.open(path) as r:
        z = r.read(1, window=win, boundless=True, fill_value=r.nodata).astype("float32")
        nod = r.nodata
        tr = r.window_transform(win)
        crs = r.crs
    z[(z == nod) | (z > 100) | (z < -500)] = np.nan
    if f > 1:
        h, w = (z.shape[0] // f) * f, (z.shape[1] // f) * f
        z = np.nanmean(z[:h, :w].reshape(h // f, f, w // f, f), axis=(1, 3))
        tr = tr * tr.scale(f, f)
    return z, tr, crs


def relief_of(z, open_px):
    ok = np.isfinite(z)
    idx = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    zf = z[tuple(idx)]
    return zf, zf - ndi.grey_opening(zf, size=(open_px, open_px)), ok


def scan_block(args):
    path, r0, c0, nr, nc, pad, f, res = args
    with np.errstate(all="ignore"):
        z, tr, crs = load_block(path, Window(c0 - pad, r0 - pad, nc + 2 * pad, nr + 2 * pad), f)
        if np.isfinite(z).sum() < 5000:
            return []
        px = res * f
        zf, rel, ok = relief_of(z, int(OPEN_M / px))
        gy, gx = np.gradient(zf, px)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        gap = ndi.binary_dilation(~ok, iterations=2)
        lab = label((rel > MIN_RELIEF) & ok)
        core = pad // f
        out = []
        for p in regionprops(lab, intensity_image=rel):
            if p.area * px * px < 20 or p.area * px * px > 15000:
                continue
            cy, cx = p.centroid
            if not (core <= cy < z.shape[0] - core and core <= cx < z.shape[1] - core):
                continue
            L, W = p.axis_major_length * px, max(p.axis_minor_length * px, px)
            H = float(p.intensity_max)
            rr, cc = p.coords[:, 0], p.coords[:, 1]
            depth = float(-np.nanmax(z[rr, cc]))
            if not (12 <= L <= 300 and W <= 60 and 1.0 <= H <= 20 and depth >= MIN_DEPTH):
                continue
            y0, y1, x0, x1 = int(cy - 60 / px), int(cy + 60 / px), int(cx - 60 / px), int(cx + 60 / px)
            wl = lab[max(y0, 0):y1, max(x0, 0):x1]
            wr = rel[max(y0, 0):y1, max(x0, 0):x1]
            bg = wr[wl == 0]
            x, y = tr * (cx + 0.5, cy + 0.5)
            lon, lat = warp_xy(crs, "EPSG:4326", [x], [y])
            perim = ndi.binary_dilation(lab == p.label, iterations=1) & (lab != p.label)
            out.append({
                "id": f"{os.path.basename(path)[:6]}-{int(y)}-{int(x)}", "bag": os.path.basename(path), "x": x, "y": y, "lat": lat[0], "lon": lon[0],
                "depth_m": round(depth, 2), "length_m": round(L, 1), "width_m": round(W, 1), "height_m": round(H, 2),
                "area_m2": round(float(p.area * px * px), 1), "max_slope": round(float(slope[rr, cc].max()), 1),
                "edge_slope": round(float(np.median(slope[perim])) if perim.any() else 0.0, 1),
                "rect": round(float(p.area / max(p.axis_major_length * p.axis_minor_length * np.pi / 4, 1)), 2),
                "solidity": round(float(p.solidity), 2), "elong": round(L / W, 2), "heading_deg": round(float(np.degrees(p.orientation)) % 180, 1),
                "bg_p95": round(float(np.percentile(bg, 95)) if bg.size else 0.0, 2),
                "neighbours": len(set(np.unique(wl)) - {0, p.label}), "near_gap": bool(gap[rr, cc].any()), "cell_m": px,
            })
        return out


def blocks(path):
    with rasterio.open(path) as r:
        res = abs(r.res[0])
        H, W = r.height, r.width
    f = max(1, int(round(CELL / res)))
    b, pad = int(BLOCK_M / res), int(PAD_M / res)
    pad -= pad % f
    b -= b % f
    return [(path, r0, c0, min(b, H - r0), min(b, W - c0), pad, f, res) for r0 in range(0, H, b) for c0 in range(0, W, b)]


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    bags = sys.argv[1:] or sorted(glob.glob(os.path.join(DATA, "bags", "*.bag")))
    for path in bags:
        dst = os.path.join(OUT, os.path.basename(path) + ".json")
        if os.path.exists(dst):
            continue
        jobs = blocks(path)
        found = []
        with Pool(int(os.environ.get("WORKERS", "9"))) as pool:
            for i, res in enumerate(pool.imap_unordered(scan_block, jobs), 1):
                found += res
                print(f"{os.path.basename(path)} block {i}/{len(jobs)} bumps {len(found)}", flush=True)
        json.dump(found, open(dst, "w"))
        print("DONE", os.path.basename(path), len(found), flush=True)
