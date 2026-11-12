import glob, json, os, sys, time
os.environ.setdefault("GDAL_CACHEMAX", "200")
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

AREA = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D, O = f"{ROOT}/data/{AREA}", f"{ROOT}/out/{AREA}"
LIVE = f"{O}/private/live"
WEB_HUNT = f"{ROOT}/out/web/{AREA}/hunt.json"
os.makedirs(f"{LIVE}/thumbs", exist_ok=True)


def shade(z, cell, px):
    ok = np.isfinite(z)
    if not ok.any():
        return None
    zf = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    gy, gx = np.gradient(-zf * 4, cell)
    az, alt = np.deg2rad(315), np.deg2rad(40)
    sl, asp = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    hs = np.sin(alt) * np.cos(sl) + np.cos(alt) * np.sin(sl) * np.cos(az - asp)
    lo, hi = np.percentile(hs[ok], [1, 99.5])
    hs = ((hs - lo) / max(hi - lo, 1e-6)).clip(0, 1)
    rel = zf - ndi.grey_opening(zf, size=(max(3, int(40 / cell)),) * 2)
    m = ((rel - 0.5) / 1.5).clip(0, 1)
    rgb = np.stack([0.30 + 0.62 * hs + 0.25 * m, 0.42 + 0.55 * hs - 0.25 * m, 0.52 + 0.45 * hs], -1).clip(0, 1)
    rgb[~ok] = (0.93, 0.95, 0.96)
    return Image.fromarray((rgb * 255).astype(np.uint8)).resize((px, px), Image.BILINEAR)


def jread(p, default):
    try:
        return json.load(open(p))
    except Exception:
        return default


def overview(state):
    import rasterio
    tifs = sorted(glob.glob(f"{D}/bags/*.tif"))
    scans = sorted(glob.glob(f"{O}/bag_scan/*.json"))
    tsig = [(t, os.path.getmtime(t)) for t in tifs]
    sig = tsig + [(s, os.path.getmtime(s)) for s in scans]
    if not tifs or sig == state.get("sig"):
        return
    if tsig == state.get("tsig"):
        return dots(state, scans, sig)
    srcs = [rasterio.open(t) for t in tifs]
    b = [s.bounds for s in srcs]
    x0, y0, x1, y1 = min(v.left for v in b), min(v.bottom for v in b), max(v.right for v in b), max(v.top for v in b)
    res = max(x1 - x0, y1 - y0) / 900
    arr = np.full((1, int((y1 - y0) / res) + 1, int((x1 - x0) / res) + 1), np.nan, "float32")
    cache = state.setdefault("low", {})
    for t, s in zip(tifs, srcs):
        k = (t, os.path.getmtime(t), res)
        if k not in cache:
            step = max(1, int(res / s.res[0]))
            low = np.full((s.height // step + 1, s.width // step + 1), np.nan, "float32")
            nd = s.nodata
            for _, w in s.block_windows(1):
                blk = s.read(1, window=w).astype("float32")
                if nd is not None:
                    blk[blk == nd] = np.nan
                r0, c0 = -(-w.row_off // step) * step - w.row_off, -(-w.col_off // step) * step - w.col_off
                sub = blk[r0::step, c0::step]
                R, C = (w.row_off + r0) // step, (w.col_off + c0) // step
                low[R:R + sub.shape[0], C:C + sub.shape[1]] = sub
            cache[k] = low
        low = cache[k]
        r0, c0 = int((y1 - s.bounds.top) / res), int((s.bounds.left - x0) / res)
        win = arr[0, r0:r0 + low.shape[0], c0:c0 + low.shape[1]]
        a = low[:win.shape[0], :win.shape[1]]
        win[...] = np.where(np.isfinite(a), a, win)
        s.close()
    tr = rasterio.transform.from_origin(x0, y1, res, res)
    z = arr[0]
    z[np.abs(z) > 1e4] = np.nan
    ok = np.isfinite(z)
    zf = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    gy, gx = np.gradient(-np.abs(zf) * 6, res)
    sl, asp = np.arctan(np.hypot(gx, gy)), np.arctan2(-gx, gy)
    hs = np.sin(0.7) * np.cos(sl) + np.cos(0.7) * np.sin(sl) * np.cos(np.deg2rad(315) - asp)
    rgb = np.stack([0.62 + 0.32 * hs, 0.75 + 0.22 * hs, 0.84 + 0.15 * hs], -1).clip(0, 1)
    rgb[~ok] = (0.96, 0.97, 0.975)
    state.update(base=(rgb * 255).astype(np.uint8), tr=tr, tsig=tsig, km2=round(float(ok.sum()) * res * res / 1e6), files=len(tifs))
    dots(state, scans, sig)


def dots(state, scans, sig):
    im, tr, n = state["base"].copy(), state["tr"], 0
    for s in scans:
        for bmp in jread(s, []):
            if "x" not in bmp:
                continue
            c, r = ~tr * (bmp["x"], bmp["y"])
            r, c = int(r), int(c)
            if 1 <= r < im.shape[0] - 1 and 1 <= c < im.shape[1] - 1:
                im[r - 1:r + 2, c - 1:c + 2] = (163, 25, 127)
                n += 1
    Image.fromarray(im).save(f"{LIVE}/overview.tmp.png")
    os.replace(f"{LIVE}/overview.tmp.png", f"{LIVE}/overview.png")
    state.update(sig=sig, bumps=n, scanned=len(scans), w=im.shape[1], h=im.shape[0])

def thumbs(state):
    seen = state.setdefault("seen", {})
    files = sorted(glob.glob(f"{O}/fine/*.npz"), key=os.path.getmtime)
    for f in files:
        rid = os.path.basename(f)[:-4]
        if rid in seen:
            continue
        try:
            d = np.load(f)
            im = shade(d["z"].astype(float), float(d["cell"]), 104)
        except Exception:
            continue
        if im is None:
            continue
        n = len(seen) + 1
        im.save(f"{LIVE}/thumbs/{n}.png")
        seen[rid] = {"n": n, "t": os.path.getmtime(f)}


def manifest(state):
    info = {o["id"]: o for o in jread(f"{O}/fine_local.json", []) + jread(f"{O}/fine_local_plus.json", []) if "err" not in o}
    hand = jread(f"{O}/hand_check.json", {})
    rank = {"ship-like": 0, "maybe": 1}
    items = []
    for rid, s in state.get("seen", {}).items():
        o, h = info.get(rid, {}), hand.get(rid) or {}
        items.append({"n": s["n"], "t": s["t"], "len": round(o["length_m"]) if o.get("length_m") else None,
                      "tall": round(o["height_m"], 1) if o.get("height_m") else None, "verdict": h.get("verdict"), "note": h.get("note")})
    items.sort(key=lambda x: (rank.get(x["verdict"], 2), -x["t"]))
    out = {"updated": time.time(), "closeups": len(items), "judged": sum(1 for i in items if i["verdict"]),
           "overview": {k: state.get(k) for k in ("km2", "bumps", "files", "scanned", "w", "h")} if state.get("sig") else state.get("prev_ov"),
           "items": items[:120]}
    json.dump(state.get("seen", {}), open(f"{LIVE}/seen.json", "w"))
    tmp = f"{LIVE}/live.json.tmp"
    json.dump(out, open(tmp, "w"))
    os.replace(tmp, f"{LIVE}/live.json")


if __name__ == "__main__":
    state, quiet = {"seen": jread(f"{LIVE}/seen.json", {}), "prev_ov": jread(f"{LIVE}/live.json", {}).get("overview") if os.path.exists(f"{LIVE}/overview.png") else None}, 0
    while True:
        thumbs(state)
        manifest(state)
        try:
            overview(state)
        except Exception as e:
            print("overview", e, flush=True)
        manifest(state)
        if os.path.exists(WEB_HUNT) and time.time() - os.path.getmtime(WEB_HUNT) > 120:
            quiet += 1
            if quiet > 2:
                break
        time.sleep(10)
