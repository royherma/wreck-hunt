import glob, json, numpy as np, geopandas as gpd, pandas as pd, rasterio
from rasterio.warp import transform as warp_xy
from scipy import ndimage as ndi
from skimage.measure import label, regionprops
from areas import DATA, OUTA
from scan import good_contributors, OPEN_PX
k = pd.concat([gpd.read_file(f"{DATA}/known_enc.gpkg")])
k = k[k.kind == "WRECKS"].copy(); k["geometry"] = k.geometry.representative_point()
k = k.drop_duplicates(subset=None).to_crs(32618)
tiles = gpd.read_file(f"{DATA}/area_tiles.gpkg").to_crs(32618)
k = gpd.sjoin(k, tiles[["tile", "geometry"]], how="inner")
rows = []
for t, grp in k.groupby("tile"):
    tif = glob.glob(f"{DATA}/tiles/BlueTopo_{t}_*.tiff")[0]
    good, _, _ = good_contributors(tif + ".aux.xml")
    with rasterio.open(tif) as r:
        z = r.read(1); c = r.read(3); inv = ~r.transform
        xs, ys = warp_xy("EPSG:32618", r.crs, list(grp.geometry.x), list(grp.geometry.y))
    ok = np.isfinite(z) & np.isin(c, list(good))
    if ok.sum() < 1000: continue
    idx = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True)
    zf = z[tuple(idx)]; rel = zf - ndi.grey_opening(zf, size=(OPEN_PX, OPEN_PX))
    for (i, row), x, y in zip(grp.iterrows(), xs, ys):
        col, rw = map(int, inv * (x, y))
        if not (0 <= rw < z.shape[0] and 0 <= col < z.shape[1]) or not ok[rw, col]: continue
        r0, c0 = max(rw-25,0), max(col-25,0)
        w = rel[r0:rw+25, c0:col+25]
        why = "flat"
        L = 0; A = 0; edge = False
        if w.max() > 1:
            lab = label(rel > 1.0)
            ii, jj = np.unravel_index(np.argmax(w), w.shape)
            lb = lab[r0+ii, c0+jj]; p = [q for q in regionprops((lab == lb).astype(int))][0]
            L = p.axis_major_length*4; A = p.area; ring = ndi.binary_dilation(~ok, iterations=8)
            edge = bool(ring[p.coords[:,0], p.coords[:,1]].any())
            why = "edge" if edge else ("too_big_area" if A > 1000 else ("short<20m" if L < 20 else ("long>300m" if L > 300 else ("tiny<6px" if A < 6 else "passes_shape"))))
        rows.append({"x": x, "y": y, "tile": t, "depth": float(-z[rw, col]), "max_relief_100m": float(w.max()), "why": why, "len": L, "area_px": A, "valsou": row.get("VALSOU"), "catwrk": row.get("CATWRK"), "watlev": row.get("WATLEV"), "quasou": row.get("QUASOU"), "sordat": row.get("SORDAT")})
d = pd.DataFrame(rows); d.to_csv(f"{OUTA}/private/charted_wreck_relief.csv", index=False)
print(len(d)); print(d.max_relief_100m.describe(percentiles=[.25,.5,.75,.9]).round(2))
print((d.max_relief_100m > 1).sum(), "have >1 m relief within 100 m")
print(d.catwrk.value_counts().head(), d.sordat.str[:4].value_counts().head(8))

print(d.why.value_counts())
print(d[d.why=="too_big_area"].area_px.describe())
