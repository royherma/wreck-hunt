import glob, json, warnings
import numpy as np, pandas as pd, geopandas as gpd, pyogrio
from shapely.geometry import box
from areas import CFG, DATA, OUTA, PROJ
warnings.filterwarnings("ignore")

UTM = PROJ
PLACES = CFG.get("places") or ["Cape Henry", "Cape Charles", "Virginia Beach", "Chesapeake Lights (2)", "Thimble Shoal Light", "Old Point Comfort Light", "New Point Comfort Light", "Wolf Trap Light"]
SHOW = {"Chesapeake Lights (2)": "Chesapeake Light"}
CATWRK = {1: "wreck, not dangerous", 2: "dangerous wreck", 3: "scattered remains", 4: "mast showing", 5: "hull showing"}


def origin():
    b = gpd.GeoSeries([box(*CFG["bbox"])], crs=4326).to_crs(UTM).total_bounds
    return b


if __name__ == "__main__":
    x0, y0, x1, y1 = origin()
    LAND, PT = CFG.get("cells", ["US3", "US4"])
    cells = sorted(glob.glob(f"{DATA}/enc/ENC_ROOT/{LAND}*/*.000")) + sorted(glob.glob(f"{DATA}/enc/ENC_ROOT/{PT}*/*.000"))
    land, places = [], {}
    B = box(*CFG["bbox"])
    for f in cells:
        L = {l[0] for l in pyogrio.list_layers(f)}
        if "LNDARE" in L and f.split("/")[-1].startswith(LAND):
            g = pyogrio.read_dataframe(f, layer="LNDARE")
            g = g[g.geom_type.isin(["Polygon", "MultiPolygon"]) & g.intersects(B)]
            if len(g):
                land.append(g.set_crs(4326, allow_override=True).clip(B))
        for lay in ["LNDRGN", "LNDMRK"]:
            if lay in L:
                g = pyogrio.read_dataframe(f, layer=lay)
                if "OBJNAM" in g:
                    for r in g[g.OBJNAM.isin(PLACES) & g.intersects(B.buffer(0.05))].itertuples():
                        places.setdefault(r.OBJNAM, r.geometry.representative_point())
    if CFG.get("place_pts"):
        places = {n: gpd.points_from_xy([x], [y])[0] for n, (x, y) in CFG["place_pts"].items()}
    if not land:
        land = [gpd.GeoDataFrame(geometry=[], crs=4326)]
    lg = gpd.GeoDataFrame(pd.concat(land), crs=4326).to_crs(UTM).dissolve().explode(index_parts=False)
    lg["geometry"] = lg.geometry.simplify(150)
    lg = lg[lg.area > 0.05e6] if len(lg) else lg
    polys = []
    for p in lg.geometry:
        xs, ys = p.exterior.xy
        polys.append([[round((x - x0) / 1000, 2), round((y - y0) / 1000, 2)] for x, y in zip(xs, ys)])
    pl = gpd.GeoSeries(list(places.values()), index=list(places.keys()), crs=4326).to_crs(UTM)
    pls = [{"name": SHOW.get(n, n), "x": round((p.x - x0) / 1000, 2), "y": round((p.y - y0) / 1000, 2), "ux": p.x, "uy": p.y} for n, p in pl.items()]

    aw = pd.read_csv(f"{DATA}/awois.csv")
    ag = gpd.GeoDataFrame(aw, geometry=gpd.points_from_xy(aw.LONDEC, aw.LATDEC), crs=4326).to_crs(UTM)
    enc = gpd.read_file(f"{DATA}/known_enc.gpkg")
    enc = enc[enc.kind == "WRECKS"].copy()
    for col in ["CATWRK", "INFORM", "SORDAT"]:
        enc[col] = enc[col] if col in enc else None
    enc["geometry"] = enc.geometry.representative_point()
    enc = enc.to_crs(UTM)
    ctx = {
        "origin": [x0, y0], "w_km": round((x1 - x0) / 1000, 1), "h_km": round((y1 - y0) / 1000, 1),
        "land": polys, "places": pls,
        "awois": [{"ux": r.geometry.x, "uy": r.geometry.y, "name": str(r.VESSLTERMS), "sunk": None if pd.isna(r.YEARSUNK) else int(r.YEARSUNK),
                   "type": str(r.FEATURE_TYPE), "history": "" if pd.isna(r.HISTORY) else str(r.HISTORY)} for r in ag.itertuples()],
        "enc_wrecks": [{"ux": r.geometry.x, "uy": r.geometry.y, "cat": CATWRK.get(int(r.CATWRK)) if pd.notna(r.CATWRK) and str(r.CATWRK) != "nan" else None,
                        "inform": None if str(r.INFORM) in ("nan", "None") else str(r.INFORM), "sordat": None if str(r.SORDAT) in ("nan", "None") else str(r.SORDAT)[:4]} for r in enc.itertuples()],
    }
    json.dump(ctx, open(f"{OUTA}/private/context.json", "w"))
    print("land polys", len(polys), "points", sum(len(p) for p in polys), "places", [p["name"] for p in pls], "awois", len(ctx["awois"]), "enc wrecks", len(ctx["enc_wrecks"]))
