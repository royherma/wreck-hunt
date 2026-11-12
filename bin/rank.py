import json, os, sys
import numpy as np, pandas as pd
from scipy import ndimage as ndi
from areas import OUTA

SRC = os.environ.get("FINE", "fine.json")


def extra(rid, cy, cx, L):
    d = np.load(f"{OUTA}/fine/{rid}.npz")
    z, cell = d["z"], float(d["cell"])
    ok = np.isfinite(z)
    zf = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    fine_rel = zf - ndi.gaussian_filter(zf, 3 / cell)
    r = int(max(L, 12) / cell / 2) + 2
    y0, y1, x0, x1 = max(int(cy) - r, 0), int(cy) + r, max(int(cx) - r, 0), int(cx) + r
    obj = np.abs(fine_rel[y0:y1, x0:x1])
    ring = np.ones_like(zf, bool); ring[y0:y1, x0:x1] = False
    bgc = np.abs(fine_rel[ring & ok])
    crisp = float(np.percentile(obj, 98))
    bg = float(np.percentile(bgc, 98)) if bgc.size else 0.0
    big = zf - ndi.grey_closing(zf, size=(int(80 / cell),) * 2)
    rr = int((max(L, 12) / 2 + 25) / cell)
    scour = float(-big[max(int(cy) - rr, 0):int(cy) + rr, max(int(cx) - rr, 0):int(cx) + rr].min())
    seam = float(np.mean(~ok))
    rel = zf - ndi.grey_opening(zf, size=(int(80 / cell),) * 2)
    w = rel[y0:y1, x0:x1]
    lab, _ = ndi.label(w > 0.15 * max(w.max(), 0.3))
    c = lab[np.unravel_index(np.argmax(w), w.shape)]
    blob = lab == c
    H = float(w[blob].max())
    box = float((blob & (w > 0.5 * H)).sum() / max(blob.sum(), 1))
    peak = float((blob & (w > 0.8 * H)).sum() / max(blob.sum(), 1))
    return round(crisp, 2), round(crisp / max(bg, 0.02), 2), round(scour, 2), round(seam, 3), round(box, 3), round(peak, 3)


if __name__ == "__main__":
    F = [o for o in json.load(open(f"{OUTA}/{SRC}")) if "err" not in o and o.get("blob")]
    for o in F:
        o["crisp_m"], o["crisp_ratio"], o["scour_m"], o["nodata_frac"], o["box"], o["flat_top"] = extra(o["id"], o["cy"], o["cx"], o["length_m"])
    out = SRC.replace(".json", "_plus.json")
    json.dump(F, open(f"{OUTA}/{out}", "w"))
    todo = pd.read_csv(f"{OUTA}/private/fine_todo.csv")
    df = pd.DataFrame(F).merge(todo, on="id")
    print(df.groupby("group")[["box", "flat_top", "crisp_ratio", "scour_m", "height_m"]].describe(percentiles=[.25, .5, .75]).T.round(2).to_string())
    print(out)
