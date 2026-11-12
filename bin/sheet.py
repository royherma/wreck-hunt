import json, os, sys
import numpy as np, pandas as pd, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
from scipy import ndimage as ndi
from areas import AREA, OUTA, ROOT

group, n, start = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 0
s = pd.read_csv(f"{OUTA}/private/fine_scored.csv")
s = s[s.group == group].sort_values("score", ascending=False).iloc[start:start + n]
cols = 6
rows = int(np.ceil(len(s) / cols))
fig, axs = plt.subplots(rows, cols, figsize=(cols * 3, rows * 3.3), facecolor="white")
ls = LightSource(azdeg=315, altdeg=35)
for ax, (i, r) in zip(np.ravel(axs), enumerate(s.itertuples(), start)):
    d = np.load(f"{OUTA}/fine/{r.id}.npz")
    z = d["z"]
    ok = np.isfinite(z)
    if not ok.all():
        z = z[tuple(ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True))]
    rgb = ls.shade(z, cmap=plt.cm.viridis, vert_exag=3, blend_mode="overlay", dx=float(d["cell"]), dy=float(d["cell"]))
    ax.imshow(rgb)
    ax.set_title(f"#{i} {r.score:.1f}  {r.length_m:.0f}x{r.width_m:.0f}m h{r.height_m:.1f}\nsl{r.edge_slope:.0f} oth{r.others} bg{r.bg_p95:.1f} d{r.depth_fine_m:.0f}", fontsize=8)
    ax.axis("off")
for ax in np.ravel(axs)[len(s):]:
    ax.axis("off")
plt.tight_layout()
dst = os.path.join(ROOT, ".claude", "artifacts", ("" if AREA == "chesapeake_mouth" else AREA + "_") + f"sheet_{group}_{start}.png")
os.makedirs(os.path.dirname(dst), exist_ok=True)
plt.savefig(dst, dpi=70)
s.assign(sheet_index=range(start, start + len(s)))[["sheet_index", "id", "score"]].to_csv(dst.replace(".png", ".csv"), index=False)
print(dst)
