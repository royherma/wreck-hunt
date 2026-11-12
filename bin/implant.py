import json, os, sys
from multiprocessing import Pool
import numpy as np, rasterio
from scipy import ndimage as ndi
from areas import OUTA
import bagscan

N = int(os.environ.get("N", "60"))
HIT_M = 30


def hull(L, W, H, heading, cell):
    n = int(max(L, W) / cell) + 6
    yy, xx = (np.mgrid[:n, :n] - n / 2) * cell
    a = np.radians(heading)
    u, v = xx * np.cos(a) + yy * np.sin(a), -xx * np.sin(a) + yy * np.cos(a)
    body = np.clip(1 - (2 * v / W) ** 2, 0, 1) * np.clip(1 - np.maximum(np.abs(2 * u / L) - 0.7, 0) / 0.3, 0, 1)
    return H * np.sqrt(body)


if __name__ == "__main__":
    src = sys.argv[1]
    dst = os.path.join(OUTA, "implant", os.path.basename(src))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    rng = np.random.default_rng(7)
    with rasterio.open(src) as r:
        z = r.read(1).astype("float32"); prof = r.profile; cell = abs(r.res[0]); tr = r.transform; nod = r.nodata
    ok = (z != nod) & (z < 100)
    inner = ndi.binary_erosion(ok, iterations=int(150 / cell))
    cand = np.argwhere(inner)
    planted = []
    while len(planted) < N:
        rr, cc = cand[rng.integers(len(cand))]
        if any((rr - p["r"]) ** 2 + (cc - p["c"]) ** 2 < (300 / cell) ** 2 for p in planted):
            continue
        L, W, H = float(rng.uniform(15, 80)), float(rng.uniform(5, 12)), float(rng.uniform(1.2, 4)); W = min(W, L / 2)
        h = hull(L, W, H, float(rng.uniform(0, 180)), cell)
        n = h.shape[0]; r0, c0 = rr - n // 2, cc - n // 2
        z[r0:r0 + n, c0:c0 + n] = np.where(h > 0, np.maximum(z[r0:r0 + n, c0:c0 + n], z[r0:r0 + n, c0:c0 + n] + h), z[r0:r0 + n, c0:c0 + n])
        x, y = tr * (cc + 0.5, rr + 0.5)
        planted.append({"r": int(rr), "c": int(cc), "x": x, "y": y, "L": round(L, 1), "W": round(W, 1), "H": round(H, 2)})
    with rasterio.open(dst, "w", **prof) as w:
        w.write(z, 1)
    found = []
    with Pool(int(os.environ.get("WORKERS", "9"))) as pool:
        for res in pool.imap_unordered(bagscan.scan_block, bagscan.blocks(dst)):
            found += res
    for p in planted:
        d = min((np.hypot(f["x"] - p["x"], f["y"] - p["y"]) for f in found), default=1e9)
        p["found"] = bool(d <= HIT_M)
    os.remove(dst)
    hit = sum(p["found"] for p in planted)
    tall = [p for p in planted if p["H"] >= 2]
    out = {"planted": N, "found": hit, "planted_2m_plus": len(tall), "found_2m_plus": sum(p["found"] for p in tall), "missed": [p for p in planted if not p["found"]]}
    json.dump({**out, "all": planted}, open(f"{OUTA}/recall_implant.json", "w"), indent=1)
    print({k: v for k, v in out.items() if k != "missed"})
    for p in out["missed"]:
        print("missed", p["L"], p["W"], p["H"])
