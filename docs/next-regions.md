# Next regions for uncharted-wreck search (checked 2026-11-11)

Scores 1-5: Q data quality, U unsearched-ness, W wreck likelihood, L subtractable list, D practical download. Total /25.
Probes: <=8 MB range reads, max 4 concurrent. Speeds are one-shot from this Mac (single sample, +/- 30%).

## Ranked table

| # | Region | Q | U | W | L | D | Tot | Why it scored so |
|---|---|---|---|---|---|---|---|---|
| 1 | Australia, Victoria/Tasmania science + marine-park surveys (AusSeabed) | 5 | 5 | 4 | 4 | 3 | 21 | Q: 0.5-2 m. U: made by habitat/park/science programs, not wreck charting. W: Shipwreck Coast. L: CC-BY list but a geodatabase from environment.gov.au (page 200, file not pulled). D: whole-zip, deflated (no partial read), 1.5 MB/s. |
| 2 | Great Lakes, NOAA OCM Lake Superior (Bayfield 2020; Apostle Islands) | 4 | 3 | 4 | 3 | 5 | 19 | Q: 2 m BAG + interpolated COG. U: NOAA survey but a coastal-mapping job, not wreck-focused. L: wreck list not verified, region is well studied by divers. D: S3, COG layout, 1.37 MB/s. Only ~180 km2 box. |
| 3 | Australia, other 2 m sets (Bass Strait, Tas west/east, Torres/Darwin AHO 0.5 m) | 5 | 4 | 3 | 4 | 3 | 19 | Same route as #1, lower wreck density per km2; AHO sets are official-charting adjacent (U down). |
| 4 | NOAA NCEI/BOEM wind-area multibeam (NY Bight, mid-Atlantic) | 4 | 4 | 4 | 4 | 2 | 18 | Q/U: BOEM/NCCOS-funded, not wreck charting. L: NOAA wrecks layer. D: raw HYSWEEP, must grid ourselves; format and size unverified. |
| 5 | California CSMP 2 m (USGS DS 781 + CSUMB) | 4 | 3 | 3 | 3 | 3 | 16 | Q: 2 m GeoTIFF, public domain. U: state science program. L: no wreck list verified. D: cmgds host answered 301/403 to curl; CSUMB page unreachable (000). |
| 6 | UK UKHO seabed mapping (CHP + 6,000 surveys) | 4 | 2 | 5 | 5 | 1 | 17 | W/L best on earth (25,890 wrecks, free). D: sign-in (Azure B2C) + WMTS tiles; raw grid download route not found; CHP surveys already used for wreck charting (U low). Resolution not published. |
| 7 | Finland (Traficom open depth data) | 4 | 4 | 3 | 3 | 2 | 16 | 1 m (or 2 m: pages conflict) GeoTIFF, Baltic preserves wood. Licence is "limited hydrographic" (no commercial use), requests via Oskari viewer, Regional Surveillance Act limits. |
| 8 | Ireland INFOMAR | 3 | 3 | 4 | 3 | 3 | 16 | Public mosaics 5/10/25 m (ImageServer pixel ~6.8 m web-mercator); 2 m only "survey leg" on request. CC BY 4.0. Wreck inventory not verified. |
| 9 | EMODnet high-res DTMs (e.g. Belgium coastal) | 3 | 3 | 4 | 2 | 4 | 16 | Belgium = 1/512 arcmin (~3.6 m), CC BY 4.0, zip 234 MB. Too coarse; Belgian 1-2 m multibeam lives at RBINS (dataset 3040) [unverified access]. |
| 10 | Norway Kartverket | 1 | - | 5 | - | - | n/a | Open dataset is 50 m depth points/contours: useless here. MAREANO not verified. |
| 11 | NZ (LINZ 2 m grids, NIWA 2-10 m) | 4 | 3 | 3 | 2 | 2 | 14 | LINZ data service reachable (200), 2 m grids per survey, some NIWA grids are CC BY-ND (no derivatives). Wreck list [unverified]. |
| 12 | NOAA Ocean Exploration deep multibeam | 1 | 5 | 2 | 3 | 3 | 14 | Beam footprint ~1-2% of depth: 4 m+ above 200 m, 20 m+ deeper [inferred]. Shipwreck-sized targets (30-100 m) show but not shape. |

Not scored (no open 1-2 m route found): Denmark, Germany BSH (data.bsh.de returned 403), Netherlands.

## Evidence (URL, status checked this session)

| Item | URL | Status / fact |
|---|---|---|
| AusSeabed 2 m zip (Peterborough-Port Fairy 2018) | https://files.ausseabed.gov.au/survey/Peterborough%20to%20Port%20Fairy%202018%202m.zip | 200, 306,572,828 B; 1 deflated COG inside (310.7 MB raw) |
| AusSeabed 2 m zip (Vlaming 2012) | https://files.ausseabed.gov.au/survey/Vlaming%20Sub-Basin%20Bathymetry%202012%202m.zip | 206 on range, 8 MB at 1.52 MB/s |
| Port Fairy to Portland 2020 2 m | https://files.ausseabed.gov.au/survey/Port%20Fairy%20to%20Portland%202020%202m.zip | 200, 65 MB |
| Bunurong 2017 2 m | https://files.ausseabed.gov.au/survey/Bunurong%20Marine%20National%20Park%20Bathymetry%202017%202m.zip | 200, 30 MB |
| Tasmania East Coast 2021 0.5 m | https://files.ausseabed.gov.au/survey/Tasmania%20East%20Coast%20Bathymetry%202021%200.5m.zip | 200, 717 MB |
| Catalogue of AusSeabed files | https://data.gov.au/data/api/3/action/package_search?q=ausseabed | 200; 211 file URLs, 65 at <=4 m (35 at 2 m, 13 at 1 m, 10 at 0.5 m) |
| AusSeabed S3 COG links (old route) | https://ausseabed-public-warehouse-bathymetry.s3.ap-southeast-2.amazonaws.com/L3/... | 404 (dead; catalogue still lists them). Use files.ausseabed.gov.au |
| AusSeabed portal pages | https://ausseabed.gov.au/data | 403 to curl |
| Australian National Shipwrecks | https://data.gov.au/data/dataset/australian-national-shipwrecks | CC BY 3.0 AU, ArcGIS file geodatabase; resource page https://www.environment.gov.au/fed/catalog/search/resource/details.page?uuid=f4fdf8ed-9fa2-41fe-a9b9-2b11509e42c5 = 200 |
| Victorian Heritage DB | https://vhd.heritagecouncil.vic.gov.au/ | 200; API listed on data.gov.au as CC BY 3.0 AU |
| NOAA OCM Bayfield 2020 (bulk) | https://noaa-nos-coastal-lidar-pds.s3.us-east-1.amazonaws.com/dem/WI_Bayfield_Multibeam_Bathy_2020_9267/index.html | 200; BAG 138 MB, 2 m interpolated TIF 82 MB (COG layout header: IFDS_BEFORE_DATA); range read 206, 4 MB at 1.37 MB/s; no licence stated, "Access: None" |
| OCM Bayfield metadata | https://www.fisheries.noaa.gov/inport/item/64386 | read; grid 2 m (text also says 1 m), bbox 46.85-46.98 N, 91.20-90.97 W |
| Only 2 multibeam sets in that S3 dem/ tree | listing of the bucket | Bayfield + USF Tampa Bay (checked, not exhaustive past 1000 prefixes) |
| NOAA wrecks list | https://www.nauticalcharts.noaa.gov/data/wrecks-and-obstructions.html | 200 |
| UKHO wrecks feature service | https://datahub.admiralty.co.uk/server/rest/services/Hosted/Wrecks_and_Obstructions_within_UK_EEZ/FeatureServer | 200, 25,890 points via /0/query?returnCountOnly |
| UKHO portal | https://datahub.admiralty.co.uk/portal/apps/sites/#/marine-data-portal | 200 |
| UKHO seabed mapping app | https://seabed.admiralty.co.uk/ | 200, Angular app, Azure B2C login, WMTS at admiraltyapi.azure-api.net/seabedMappingWMTS/v1/; page says 6,000+ surveys, 261,604 km2 (36% of UK seabed), UKHO Bathymetry Data Licence |
| Finland Traficom | https://traficom.fi/en/hydrography/hydrographic-data-services/bathymetric-data | page read; viewer https://julkinen.traficom.fi/oskari/?lang=en [not curled] |
| INFOMAR ImageServer | https://image.marine.ie/arcgis/rest/services/INFOMAR/AllSurvey/ImageServer | 200 JSON, 307 mosaic items, none finer than 6.78 m mercator pixel |
| INFOMAR release note | https://www.marine.ie/site-area/news-events/press-releases/infomar-releases-new-high-resolution-data-irish-shelf-and | 2 m = survey legs only |
| INFOMAR old record | https://data.marine.ie/geonetwork/srv/api/records/ie.marine.data:dataset.858 | CC BY 4.0, 10/25/100 m |
| EMODnet Belgium DTM | https://downloads.emodnet-bathymetry.eu/high_resolution/2243_BELGIUM_MULTIBEAM_COASTAL_DTM010218.emo.zip | 200, 234,060,796 B, CC BY 4.0 |
| EMODnet WMS | https://ows.emodnet-bathymetry.eu/wms?service=WMS&request=GetCapabilities | 200 |
| Kartverket depth data | https://www.geonorge.no/geonetworktest/srv/api/records/2751aacf-5472-4850-a208-3532a51c529a | read: 50 m point spacing, CC BY 4.0 |
| NCEI BOEM multibeam record | https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.multibeam:BOEM-2017-L1_Multibeam/html | 200; HYSWEEP raw |
| USGS cmgds | https://cmgds.marine.usgs.gov/data-releases/datarelease/10.5066-P9EC35PF | 301 (curl), 403 (WebFetch) |
| LINZ data service | https://data.linz.govt.nz/ | 200 |
| BSH | https://data.bsh.de/ | 403 |

## Ship-loss density sources
- Australia: ANSDB lists wrecks in all Australian waters; count not read this session [unverified]. Victoria's Shipwreck Coast is widely cited as 600+ wrecks [unverified].
- Great Lakes: ~6,000 wrecks is the usual figure from shipwreck societies [unverified].
- UK: 25,890 wreck/obstruction points in the UKHO layer (verified above; includes obstructions).

## Recommendation
Go Australia, Victoria Shipwreck Coast first. It is the only candidate with fine grids (2 m, plus 0.5 m on the Apollo Bay "City of Rayville" survey), made by non-charting programs, a free CC BY wreck list, and downloads that work today. Cost: whole-file zips, no partial reads.

First step (one file, 65 MB, about 45 s at 1.5 MB/s):
`curl -L -o port-fairy-portland.zip "https://files.ausseabed.gov.au/survey/Port%20Fairy%20to%20Portland%202020%202m.zip"`, unzip into a new empty folder, run the existing scan on the COG. In parallel fetch the Australian National Shipwrecks geodatabase from the environment.gov.au page above (CC BY 3.0 AU) and the Victorian Heritage Database for the subtract list. Then Peterborough to Port Fairy (307 MB). Run the Bayfield 2 m TIF (82 MB, S3, partial reads OK) as a cheap second test of the pipeline on freshwater.

## Caveats
- AusSeabed "licence" shows as `notspecified` in CKAN; the shipwreck list is CC BY 3.0 AU. Confirm the grid licence on the AusSeabed portal before publishing finds.
- Do not publish coordinates of any find that survives subtraction until checked with the state heritage body (Australian wrecks over 75 years are protected by law [unverified]).
