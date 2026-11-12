import json, os, sys
import numpy as np, pandas as pd
from scipy import ndimage as ndi
from skimage.measure import label, find_contours
from shapely.geometry import MultiPoint, Polygon
from areas import OUTA


def straightness(rid, cy, cx, L, outa=OUTA):
    d = np.load(f"{outa}/fine/{rid}.npz")
    z, cell = d["z"], float(d["cell"])
    ok = np.isfinite(z)
    zf = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    rel = zf - ndi.grey_opening(zf, size=(int(80 / cell),) * 2)
    r = int(max(L, 12) / cell / 2) + 4
    y0, x0 = max(int(cy) - r, 0), max(int(cx) - r, 0)
    w = rel[y0:int(cy) + r, x0:int(cx) + r]
    if w.size == 0 or w.max() < 0.5:
        return None
    lab = label(w > 0.35 * w.max())
    blob = lab == lab[np.unravel_index(np.argmax(w), w.shape)]
    if blob.sum() < 8:
        return None
    pts = np.argwhere(blob)[:, ::-1] + 0.5
    rect = MultiPoint([tuple(p) for p in pts]).minimum_rotated_rectangle
    if not isinstance(rect, Polygon) or rect.area == 0:
        return None
    fill = float(blob.sum() / rect.area)
    cs = find_contours(blob.astype(float), 0.5)
    edge = np.vstack(cs)[:, ::-1] if cs else np.zeros((0, 2))
    from shapely.geometry import Point
    ring = rect.exterior
    near = float(np.mean([ring.distance(Point(p)) <= 1.5 for p in edge])) if len(edge) else 0.0
    gy, gx = np.gradient(np.where(blob, w, 0))
    mag = np.hypot(gx, gy); m = mag > np.percentile(mag[mag > 0], 50) if (mag > 0).any() else mag > 0
    ang = np.mod(np.arctan2(gy[m], gx[m]), np.pi / 2)
    c = np.abs(np.mean(np.exp(4j * ang))) if ang.size else 0.0
    return round(fill, 3), round(near, 3), round(float(c), 3)


def run(outa, src, group_csv=None):
    F = [o for o in json.load(open(f"{outa}/{src}")) if "err" not in o and o.get("blob")]
    rows = []
    for o in F:
        s = straightness(o["id"], o["cy"], o["cx"], o["length_m"], outa)
        if s:
            rows.append({"id": o["id"], "rect_fill": s[0], "edge_on_rect": s[1], "right_angles": s[2]})
    d = pd.DataFrame(rows)
    d["straight"] = (d.rect_fill.clip(0, 1) + d.edge_on_rect + d.right_angles).round(3)
    return d


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "fine_local_plus.json"
    d = run(OUTA, src)
    d.to_csv(f"{OUTA}/private/edges.csv", index=False)
    print(len(d), d.straight.describe().round(2).to_dict())
