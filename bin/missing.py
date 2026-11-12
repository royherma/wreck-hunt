import json, os, re, urllib.parse, urllib.request
from areas import AREA, CFG, DATA, OUTA, ROOT

WEB = os.path.join(ROOT, "out", "web") if AREA == "chesapeake_mouth" else os.path.join(ROOT, "out", "web", AREA)
FT = 0.3048
ANSDB = "https://gis.environment.gov.au/gispub/rest/services/heritage/shipwrecks_query/MapServer/32/query"

STATUS_WI = {
    "Ira H. Owen (1887)": ("unfound", "No recorded search. 19 lost in the 1905 Mataafa storm; wreckage seen 12 miles east of Michigan Island", "https://en.wikipedia.org/wiki/SS_Ira_H._Owen"),
    "Manistee (1867)": ("unfound", "Sheltered at Bayfield for 4 days, left on the 5th and vanished with all aboard", "https://en.wikipedia.org/wiki/SS_Manistee_(1867)"),
    "Cormorant (1873)": ("unclear", "Burned off Basswood Island; the hull may have been towed away and salvaged", "https://shotlinediving.com/wreck/cormorant-us-125334/"),
    "May Corgan (1883?)": ("located, not surveyed", "Lost off Bark Point when the tow line parted in a gale; probably scattered in about 30 ft", "https://shotlinediving.com/wreck/may-corgan/"),
    "Herring King": ("remains known", "Hull towed to Sand Island and used as a cabin base", "https://shotlinediving.com/wreck/herring-king-fish-hawk/"),
    "John A. Paige (1881)": ("unclear", "Burned to the waterline in Siskiwit Bay, 1892", "https://www.wisconsinshipwrecks.org/Vessel/Details/317"),
    "Linda E (1937)": ("unfound", "Fishing tug reported missing 11 Dec 1998 near Port Washington; the Coast Guard search found no sign of the boat or crew", "https://www.wisconsinshipwrecks.org/Vessel/Details/753"),
    "Prussia (1873)": ("position listed, not surveyed", "Burned off Sand Island; the light keeper saved all 11 crew", "https://wisconsinshipwrecks.org/Vessel/Details/514"),
}
NOTE_AU = {
    "S.S. CHAMPION": ("unfound", "Sank in 5 minutes after hitting the Lady Bird at night, about 32 lives lost. Heritage Victoria lists it as lost in the shipping channel east-south-east of Cape Otway. Iron screw steamer, 129 ft", "https://tynebuiltships.co.uk/C-Ships/champion1854-2.html"),
    "W. GORDON": ("unfound", "Disappeared at sea off Cape Otway", None),
    "M.V. CITY OF RAYVILLE": ("found, re-found by our scan", "Sank in 1940; our scanner found it 204 m from its listed spot", None),
}


def leads():
    p = os.path.join(WEB, "hunt.json")
    return json.load(open(p)).get("leads", []) if os.path.exists(p) else []


def fits(length_m, ls):
    if not length_m:
        return []
    return [f"{l['id']} ({l['length_m']:.0f} m)" for l in ls if 0.35 * length_m <= l["length_m"] <= 1.2 * length_m]


def clean(t):
    t = (t or "").strip().strip('"')
    if not t or re.search(r"By The Numbers|Gallery|Details Vessel", t):
        return ""
    t = t[:220]
    cut = t.rfind(". ")
    return t[:cut + 1] if cut > 40 else t.rsplit(" ", 1)[0] + "..."


def wisconsin():
    rows = json.load(open(f"{OUTA}/missing_ships.json"))
    out = []
    for r in rows:
        st = STATUS_WI.get(r["name"], ("no public position", clean(r["last_voyage"]), None))
        L = float(r["length_ft"]) * FT if r.get("length_ft") else None
        out.append({"name": r["name"], "type": r["type"], "length_m": round(L) if L else None, "cargo": r["cargo"] or None, "where": r["near"] or ("Lake Superior" if AREA == "bayfield" else "Lake Michigan"),
                    "status": st[0], "story": st[1], "source": st[2] or f"https://www.wisconsinshipwrecks.org/Vessel/Details/{r['id']}"})
    return out


def australia():
    q = urllib.parse.urlencode({"where": "UPPER(WHERE_LOST) LIKE '%OTWAY%' OR UPPER(WHERE_LOST) LIKE '%APOLLO%'", "returnGeometry": "false", "f": "json",
                                "outFields": "VESSEL_NAME,LATITUDE,LONGITUDE,YEAR_WRECKED,GROSS_TONNAGE,WHERE_LOST,VESSEL_TYPE_DESC"})
    with urllib.request.urlopen(f"{ANSDB}?{q}", timeout=60) as r:
        feats = [f["attributes"] for f in json.load(r)["features"]]
    out = []
    for a in feats:
        n = a["VESSEL_NAME"] or ""
        rough = len(str(a["LATITUDE"]).split(".")[-1]) <= 3
        st = NOTE_AU.get(n, ("rough position only" if rough else "position listed", "", None))
        t = a["GROSS_TONNAGE"] or 0
        out.append({"name": n.title(), "year": a["YEAR_WRECKED"], "type": a["VESSEL_TYPE_DESC"], "tons": int(t) if t else None,
                    "length_m": 39 if n == "S.S. CHAMPION" else (135 if "RAYVILLE" in n else None), "where": a["WHERE_LOST"], "status": st[0], "story": st[1],
                    "source": st[2] or "https://gis.environment.gov.au/gispub/rest/services/heritage/shipwrecks_query/MapServer/32"})
    order = {"unfound": 0, "found, re-found by our scan": 1}
    return sorted(out, key=lambda x: (order.get(x["status"], 2), -(x["tons"] or 0)))


if __name__ == "__main__":
    ls = leads()
    ships = wisconsin() if AREA in ("bayfield", "lake_michigan_wi") else australia() if AREA == "apollo_bay" else []
    for s in ships:
        s["could_be"] = fits(s.get("length_m"), ls) if s["status"].startswith("unfound") else []
    src = {"bayfield": "Wisconsin Historical Society shipwreck list", "lake_michigan_wi": "Wisconsin Historical Society shipwreck list", "apollo_bay": "Australian National Shipwreck Database"}.get(AREA)
    json.dump({"area": CFG["name"], "source": src, "ships": ships}, open(os.path.join(WEB, "missing.json"), "w"), indent=1)
    print(AREA, len(ships), [s["name"] for s in ships if s["could_be"]])
