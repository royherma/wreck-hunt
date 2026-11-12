import glob, json, os, numpy as np, pandas as pd
from fine import features, OUT
from areas import OUTA
rows = []
for f in glob.glob(f"{OUT}/*.npz"):
    d = np.load(f); feat, _ = features(d["z"], float(d["cell"]))
    if feat and feat.get("blob"):
        feat.update({"id": os.path.basename(f)[:-4], "cell_m": float(d["cell"]), "depth_fine_m": round(float(-np.nanmedian(d["z"])), 2), "survey": "pending_", "depth_coarse_m": None, "centre_ok": True})
        rows.append(feat)
json.dump(rows, open(f"{OUTA}/fine_preview.json", "w"))
print(len(rows))
