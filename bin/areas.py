import os
AREAS = {
    "outer_banks": {"name": "Outer Banks, NC", "bbox": (-76.3, 34.5, -75.2, 35.6), "enc": ["NC"], "utm": 32618},
    "chesapeake_mouth": {"name": "Chesapeake Bay mouth, VA", "bbox": (-76.4, 36.6, -75.5, 37.4), "enc": ["VA", "NC", "MD"], "utm": 32618},
    "victoria": {"name": "Shipwreck Coast, Victoria, Australia", "bbox": (142.0, -38.5, 142.35, -38.3), "enc": [], "utm": 32754},
    "apollo_bay": {"name": "Apollo Marine Park, Victoria, Australia", "bbox": (143.40, -39.09, 143.85, -38.87), "enc": [], "utm": 32754, "proj": 32754, "src": "AusSeabed Apollo Marine Park 2020 2 m (Deakin University)",
                   "place_pts": {"Cape Otway": (143.511, -38.857), "Apollo Bay": (143.671, -38.757), "Johanna": (143.376, -38.760)}, "years": [2020, 2020], "locator": {"lon": 143.6, "lat": -38.95}, "closeup": "2 m", "known_m": 1000, "source": "AusSeabed"},
    "bayfield": {"name": "Bayfield, Lake Superior, Wisconsin", "bbox": (-91.22, 46.83, -90.95, 47.0), "enc": [], "utm": 32615, "src": "NOAA OCM Bayfield 2020 multibeam 2 m", "proj": 26915, "places": ["Bark Point", "Siskiwit Point", "Sand Point", "Sand Island Light", "Roman Point", "Point Detour", "Swallow Point"], "cells": ["US4", "US5"], "years": [2020, 2020], "locator": {"lon": -91.1, "lat": 46.9}, "closeup": "2 m", "source": "NOAA OCM"},
    "lake_michigan_wi": {"name": "Wisconsin Shipwreck Coast, Lake Michigan", "bbox": (-87.90, 43.16, -87.35, 44.34), "enc": [], "utm": 32616, "src": "NOAA NOS multibeam 2017-2022 (W00440, W00463, H13635-H13638, H13640) 1-2 m", "proj": 26916,
                         "place_pts": {"Port Washington": (-87.8756, 43.3875), "Sheboygan": (-87.7145, 43.7508), "Manitowoc": (-87.6576, 44.0886), "Two Rivers": (-87.5668, 44.1544), "Cleveland": (-87.7, 43.9111)},
                         "cells": ["US4", "US5"], "years": [2017, 2022], "locator": {"lon": -87.6, "lat": 43.75}, "closeup": "1-2 m", "source": "NOAA NCEI"},
    "lake_erie": {"name": "Cleveland offshore, Lake Erie, Ohio", "bbox": (-82.0, 41.45, -81.5, 41.72), "enc": ["OH"], "utm": 32617, "proj": 26917, "src": "NOAA NOS multibeam 2022 (H13609, H13615, H13608) 1 m", "known_m": 250,
                  "place_pts": {"Cleveland": (-81.6944, 41.4993), "Rocky River": (-81.8393, 41.4900), "Euclid": (-81.5593, 41.5934), "Lakewood": (-81.7982, 41.4820)},
                  "cells": ["US4", "US5"], "years": [2022, 2022], "locator": {"lon": -81.7, "lat": 41.6}, "closeup": "1 m", "source": "NOAA NCEI"},
    "ny_bight": {"name": "New York Bight, off New Jersey", "bbox": (-74.0, 39.85, -73.05, 40.5), "enc": ["NJ", "NY"], "utm": 32618, "proj": 26918, "src": "NOAA NOS multibeam 2013-2018 (H12608, H12610, H12627-H12629, W00438, W00481) 2 m, 0.5 m", "known_m": 250,
                 "place_pts": {"Sandy Hook": (-74.0, 40.46), "Long Branch": (-73.99, 40.30), "Shark River Inlet": (-74.04, 40.19)},
                 "cells": ["US3", "US4"], "years": [2013, 2018], "locator": {"lon": -73.6, "lat": 40.2}, "closeup": "0.5-2 m", "source": "NOAA NCEI"},
    "lake_huron_thunder_bay": {"name": "Thunder Bay Sanctuary (Shipwreck Alley), Lake Huron, Michigan", "bbox": (-84.0, 44.9, -82.8, 45.7), "enc": ["MI"], "utm": 32617, "proj": 26917, "src": "NOAA NOS multibeam 2010-2025 (H12132, H12133, H12964, W00499, F00862, F00863, H14145, H14146) 0.5-2 m", "known_m": 250,
                               "place_pts": {"Alpena": (-83.4327, 45.0617), "Thunder Bay Island": (-83.1953, 45.0378), "North Point": (-83.3, 45.05), "Middle Island": (-83.3333, 45.1917), "Presque Isle": (-83.4883, 45.3417), "Stoneport": (-83.4, 45.2)},
                               "cells": ["US4", "US5"], "years": [2010, 2025], "locator": {"lon": -83.3, "lat": 45.2}, "closeup": "0.5-2 m", "source": "NOAA NCEI"},
}
AREA = os.environ.get("AREA", "chesapeake_mouth")
CFG = AREAS[AREA]
PROJ = CFG.get("proj", 26918)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", AREA)
OUTA = os.path.join(ROOT, "out", AREA)
