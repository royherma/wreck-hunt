const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

let modal = null, map = null, token = 0, leafletReady = null;

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletReady) return leafletReady;
  leafletReady = new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = LEAFLET_CSS;
    document.head.append(css);
    const s = document.createElement("script");
    s.src = LEAFLET_JS; s.onload = res; s.onerror = () => { leafletReady = null; rej(new Error("map library")); };
    document.head.append(s);
  });
  return leafletReady;
}

const dm = (v, pos, neg) => {
  const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60;
  return `${d}°${m.toFixed(3).padStart(6, "0")}'${v >= 0 ? pos : neg}`;
};
const km = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

function build() {
  const el = document.createElement("div");
  el.id = "spot";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Exact spot");
  el.innerHTML = `<div class="spanel"><div class="shead"><span class="sttl">Exact spot</span><span class="spriv">Private to this Mac</span><span class="grow"></span><button type="button" class="sx" aria-label="Close">Close <span class="k">Esc</span></button></div><div id="spotmap"></div><div class="sinfo"><div class="sleft"><div class="scoord" id="scoord"></div><div class="sbtns"><button type="button" id="scopy" class="sbtn">Copy</button><a id="sgm" class="sbtn primary" target="_blank" rel="noopener">Open in Google Maps</a></div><p class="slegend"><i class="lg lead"></i>This one <i class="lg dia"></i>Charted wreck <i class="lg hol"></i>Old list wreck or obstruction. Rings: 1 km and 5 km</p></div><div class="sright"><div class="snh">Nearest known wrecks</div><ol id="snear"></ol></div></div></div>`;
  el.addEventListener("click", (e) => { if (e.target === el) closeSpot(); });
  el.querySelector(".sx").addEventListener("click", closeSpot);
  document.body.append(el);
  addEventListener("keydown", (e) => {
    if (!modal || modal.hidden) return;
    if (e.key === "Tab") return;
    e.stopImmediatePropagation();
    if (e.key === "Escape") { e.preventDefault(); closeSpot(); }
  }, true);
  return el;
}

export function isSpotOpen() { return !!modal && !modal.hidden; }

export function closeSpot() {
  token++;
  if (!modal) return;
  modal.hidden = true;
  if (map) { map.remove(); map = null; }
  document.getElementById("scoord").textContent = "";
  document.getElementById("snear").innerHTML = "";
}

const diamond = (cls) => window.L.divIcon({ className: "", html: `<i class="mk ${cls}"></i>`, iconSize: [16, 16], iconAnchor: [8, 8] });

export async function openSpot(id) {
  if (!modal) modal = build();
  const my = ++token;
  modal.hidden = false;
  const note = (t) => { document.getElementById("scoord").textContent = t; };
  note("Loading...");
  document.getElementById("snear").innerHTML = "";
  document.getElementById("sgm").removeAttribute("href");
  let data;
  try {
    const [r] = await Promise.all([fetch("/api/where?id=" + encodeURIComponent(id), { cache: "no-store" }), loadLeaflet()]);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch { if (my === token) note("Could not load the spot"); return; }
  if (my !== token) return;
  const L = window.L;
  const { lat, lon } = data;
  const near = data.nearby || [];
  note(`${dm(lat, "N", "S")}  ${dm(lon, "E", "W")}`);
  const text = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const copy = document.getElementById("scopy");
  copy.textContent = "Copy";
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); }
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 1400);
  };
  document.getElementById("sgm").href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  document.getElementById("snear").innerHTML = near.length
    ? near.slice(0, 6).map((n) => `<li><b>${km(n.dist_m)}</b> ${n.name || (n.kind === "charted wreck" ? "Unnamed charted wreck" : "Unnamed " + n.kind.replace(" list", ""))}${n.sunk ? ` (${n.sunk})` : ""}<span>${n.kind}${n.category ? ", " + n.category : ""}</span></li>`).join("")
    : "<li>No known wrecks within 5 km</li>";

  map = L.map("spotmap", { zoomSnap: 0.25, attributionControl: true, maxZoom: 16 });
  const osm = L.tileLayer(OSM, { maxZoom: 16, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  const sea = L.tileLayer(ESRI, { maxZoom: 10, minZoom: 0, attribution: "Tiles &copy; Esri, GEBCO, NOAA, National Geographic, DeLorme, HERE, Geonames.org" });
  L.control.layers({ "Map": osm, "Sea floor (zoom 10 or less)": sea }, null, { position: "topright", collapsed: false }).addTo(map);
  [[5000, "5 km"], [1000, "1 km"]].forEach(([r, label]) => {
    L.circle([lat, lon], { radius: r, color: "#1F4E6B", weight: 1.2, dashArray: "5 5", fill: false, opacity: 0.8, interactive: false }).addTo(map);
    const top = [lat + (r / 111320), lon];
    L.marker(top, { icon: L.divIcon({ className: "", html: `<span class="ring">${label}</span>`, iconSize: [40, 14], iconAnchor: [20, 7] }), interactive: false }).addTo(map);
  });
  near.forEach((n) => {
    const m = L.marker([n.lat, n.lon], { icon: diamond(n.kind === "charted wreck" ? "solid" : "hollow"), keyboard: false }).addTo(map);
    if (n.name) m.bindTooltip(`${n.name}${n.sunk ? " (" + n.sunk + ")" : ""}`, { permanent: true, direction: "right", offset: [8, 0], className: "wlabel" });
    else m.bindTooltip(n.kind + (n.category ? ", " + n.category : ""), { direction: "top" });
  });
  L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<i class="mk lead"></i>', iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).addTo(map);
  const pts = [[lat, lon], ...near.slice(0, 4).map((n) => [n.lat, n.lon])];
  const b = L.latLngBounds(pts);
  map.invalidateSize();
  if (pts.length > 1) map.fitBounds(b, { padding: [70, 70], maxZoom: 15 }); else map.setView([lat, lon], 14);
  setTimeout(() => { if (map) map.invalidateSize(); }, 120);
}
