import os, re, sys
import numpy as np, rasterio
from rasterio.windows import Window

STEP = 2048


def convert(src, dst, res):
    opts = {"MODE": "RESAMPLED_GRID", "RESX": res, "RESY": res} if "_VR_" in os.path.basename(src) else {}
    with rasterio.open(src, **opts) as r:
        z = re.search(r"[Zz]one (\d+)", r.crs.wkt); z = int(z.group(1)) if z else 16
        crs = rasterio.crs.CRS.from_epsg((26900 if "NAD83" in r.crs.wkt else 32600) + z)
        prof = dict(driver="GTiff", height=r.height, width=r.width, count=1, dtype="float32", crs=crs, transform=r.transform, nodata=1e6,
                    tiled=True, blockxsize=512, blockysize=512, compress="deflate", predictor=3, BIGTIFF="YES")
        with rasterio.open(dst, "w", **prof) as w:
            for r0 in range(0, r.height, STEP):
                for c0 in range(0, r.width, STEP):
                    win = Window(c0, r0, min(STEP, r.width - c0), min(STEP, r.height - r0))
                    z = r.read(1, window=win).astype("float32")
                    z[(z == r.nodata) | (z > 100) | (z < -500)] = 1e6
                    w.write(z, 1, window=win)
    print("OK", dst, flush=True)


if __name__ == "__main__":
    dstdir = sys.argv[1]
    res = float(sys.argv[2])
    for src in sys.argv[3:]:
        name = os.path.basename(src).replace("_MB_", "_").replace("_LWD", "").replace("_VR", "").split("_1of")[0].split("_2of")[0].split("_3of")[0]
        dst = os.path.join(dstdir, name + ".tif")
        if not os.path.exists(dst):
            convert(src, dst, res)
