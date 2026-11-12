import glob, warnings
import geopandas as gpd, pandas as pd, pyogrio
from shapely.geometry import box
warnings.filterwarnings("ignore")
from areas import CFG, DATA
AREA = box(*CFG["bbox"]).buffer(0.3)
LAYERS = ["WRECKS", "OBSTRN", "UWTROC"]
out = []
for f in sorted(glob.glob(f"{DATA}/enc/ENC_ROOT/*/*.000")):
    have = {l[0] for l in pyogrio.list_layers(f)}
    for lay in LAYERS:
        if lay not in have:
            continue
        g = pyogrio.read_dataframe(f, layer=lay)
        if g.empty:
            continue
        g = g.set_crs(4326, allow_override=True)
        g = g[g.intersects(AREA)]
        if g.empty:
            continue
        cols = [c for c in ["OBJNAM", "CATWRK", "CATOBS", "VALSOU", "WATLEV", "EXPSOU", "QUASOU", "SORDAT", "SORIND", "INFORM"] if c in g.columns]
        g = g[cols + ["geometry"]].copy()
        g["kind"] = lay
        g["cell"] = f.split("/")[-1][:-4]
        out.append(g)
k = gpd.GeoDataFrame(pd.concat(out, ignore_index=True), crs=4326)
k["geometry"] = k.geometry.apply(lambda g: g if g.geom_type == "Point" else g)
for c in k.columns:
    if c != "geometry" and k[c].dtype == object:
        k[c] = k[c].astype(str)
k.to_file(f"{DATA}/known_enc.gpkg")
pts = k.copy(); pts["geometry"] = pts.geometry.representative_point()
pts["key"] = pts.geometry.x.round(4).astype(str) + "," + pts.geometry.y.round(4).astype(str)
print("features", len(k), "unique spots", pts.key.nunique())
print(k.groupby("kind").size().to_dict())
print(k.drop_duplicates("OBJNAM").OBJNAM.head(15).tolist() if "OBJNAM" in k else "")
