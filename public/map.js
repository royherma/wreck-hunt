const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const $ = (s) => document.querySelector(s);
const km = (m) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`);
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const hav = (a, b, c, d) => {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(x));
};
const label = (k) => k.name || (k.kind === "charted wreck" ? `Unnamed ${k.cat || "wreck"}` : k.kind.startsWith("old wreck") ? "Unnamed old list wreck" : k.cat || k.kind);

const S = { sel: null, ring: 5000, others: false, obs: true, ringLayer: null, selLayers: [], leadMk: new Map() };

async function init() {
  let data;
  try {
    const r = await fetch("/api/map", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch {
    $("#list").innerHTML = "<li>Could not load the map data</li>";
    return;
  }
  const L = window.L;
  const known = data.known.map(([lat, lon, kind, name, cat]) => ({ lat, lon, kind, name, cat }));
  const wrecks = [];
  known.filter((k) => k.kind === "charted wreck" || k.kind === "old wreck list").forEach((k) => {
    const dup = wrecks.find((w) => hav(w.lat, w.lon, k.lat, k.lon) < 60);
    if (!dup) wrecks.push({ ...k });
    else { if (!dup.name && k.name) dup.name = k.name; if (!dup.cat && k.cat) dup.cat = k.cat; }
  });
  const leads = data.leads.map((l) => {
    const d = wrecks.map((w) => ({ w, m: hav(l.lat, l.lon, w.lat, w.lon) })).sort((a, b) => a.m - b.m).slice(0, 3);
    return { ...l, near: d, nearest: d[0]?.m ?? Infinity, worth: l.verdict === "maybe" };
  });
  const byId = new Map(leads.map((l) => [l.id, l]));
  leads.forEach((l) => l.short && byId.set(l.short, l));

  const map = L.map("map", { zoomSnap: 0.25, maxZoom: 16, preferCanvas: true });
  L.tileLayer(OSM, { maxZoom: 16, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  const canvas = L.canvas({ padding: 0.3 });

  data.areas.forEach((a) => {
    const reef = a.name || a.kind === "wreck area";
    L.polygon(a.ring, { renderer: canvas, color: "#1F4E6B", weight: reef ? 1.2 : 0.7, opacity: reef ? 0.6 : 0.35, fillColor: "#1F4E6B", fillOpacity: reef ? 0.14 : 0.07 })
      .bindTooltip(a.name || a.kind, { sticky: true }).addTo(map);
  });

  const obsLayer = L.layerGroup();
  known.filter((k) => k.kind.includes("obstruction")).forEach((k) => {
    L.circleMarker([k.lat, k.lon], { renderer: canvas, radius: 3, color: "#1F4E6B", weight: 1, opacity: k.kind.startsWith("old") ? 0.35 : 0.5, fillOpacity: 0 })
      .bindTooltip(`${esc(label(k))}<br><small>${esc(k.kind)}</small>`).addTo(obsLayer);
  });
  obsLayer.addTo(map);

  wrecks.forEach((k) => {
    const old = k.kind === "old wreck list";
    L.marker([k.lat, k.lon], { icon: L.divIcon({ className: "", html: `<i class="mk ${old ? "hollow" : "solid"}"></i>`, iconSize: [16, 16], iconAnchor: [8, 8] }), keyboard: false, zIndexOffset: 200 })
      .bindTooltip(`${esc(label(k))}<br><small>${esc(k.kind)}${k.cat && k.name ? ", " + esc(k.cat) : ""}</small>`).addTo(map);
  });

  const otherLayer = L.layerGroup();
  leads.filter((l) => !l.worth).forEach((l) => {
    L.circleMarker([l.lat, l.lon], { renderer: canvas, radius: 3.5, color: "#A3197F", weight: 1, fillColor: "#A3197F", fillOpacity: 0.35, opacity: 0.6 })
      .on("click", () => select(l.id)).bindTooltip(l.id).addTo(otherLayer);
  });

  const worth = leads.filter((l) => l.worth);
  worth.forEach((l) => {
    const m = L.marker([l.lat, l.lon], { icon: L.divIcon({ className: "", html: `<i class="mk lead" data-id="${l.id}"></i>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000, keyboard: false }).addTo(map);
    m.bindTooltip(l.id, { permanent: true, direction: "right", offset: [12, 0], className: "lid" });
    m.on("click", () => select(l.id));
    S.leadMk.set(l.id, m);
  });

  function renderList() {
    const rows = leads.filter((l) => l.worth || S.others).sort((a, b) => a.nearest - b.nearest);
    $("#list").innerHTML = rows.map((l) => {
      const n = l.near[0];
      return `<li data-id="${l.id}" class="${l.worth ? "w" : ""}${S.sel === l.id ? " sel" : ""}"><span style="color:var(--ink)">${l.id}</span><span>${n ? esc(label(n.w)) : "none"}</span><b>${n ? km(n.m) : "-"}</b></li>`;
    }).join("");
  }

  function clearSel() {
    S.selLayers.forEach((x) => map.removeLayer(x));
    S.selLayers = [];
    if (S.ringLayer) { map.removeLayer(S.ringLayer); S.ringLayer = null; }
    document.querySelectorAll(".mk.sel").forEach((e) => e.classList.remove("sel"));
  }

  function drawRing(l) {
    if (S.ringLayer) { map.removeLayer(S.ringLayer); S.ringLayer = null; }
    if (!l || !S.ring) return;
    S.ringLayer = L.layerGroup([
      L.circle([l.lat, l.lon], { radius: S.ring, color: "#A3197F", weight: 1.4, dashArray: "6 5", fill: false, interactive: false }),
      L.marker([l.lat + S.ring / 111320, l.lon], { icon: L.divIcon({ className: "", html: `<span class="ring">${S.ring / 1000} km</span>`, iconSize: [40, 14], iconAnchor: [20, 7] }), interactive: false }),
    ]).addTo(map);
  }

  function select(id, fit = true) {
    const l = byId.get(id);
    if (!l) return;
    S.sel = l.id;
    history.replaceState(null, "", "#" + l.id);
    clearSel();
    if (!l.worth && !S.others) { $("#oth").checked = S.others = true; renderList(); }
    l.near.forEach((n, i) => {
      const line = L.polyline([[l.lat, l.lon], [n.w.lat, n.w.lon]], { color: "#A3197F", weight: 2, dashArray: "2 6", opacity: 0.9, interactive: false }).addTo(map);
      const mid = [(l.lat + n.w.lat) / 2, (l.lon + n.w.lon) / 2];
      const t = L.marker(mid, { icon: L.divIcon({ className: "", html: `<span class="dl">${km(n.m)}</span>`, iconSize: [60, 18], iconAnchor: [30, 9] }), interactive: false, zIndexOffset: 900 - i }).addTo(map);
      S.selLayers.push(line, t);
    });
    if (!l.worth) {
      S.selLayers.push(L.circleMarker([l.lat, l.lon], { radius: 8, color: "#A3197F", weight: 2.5, fillColor: "#fff", fillOpacity: 1 }).addTo(map));
    }
    S.leadMk.get(l.id)?.getElement()?.querySelector(".mk")?.classList.add("sel");
    drawRing(l);
    const d = $("#detail");
    d.hidden = false;
    const n0 = l.near[0];
    d.innerHTML = `<h2>${l.id}<small>${l.short ? l.short + ", " : ""}${l.worth ? "Worth a look" : l.verdict === "unlikely" ? "Unlikely" : l.group === "in_charted_area" ? "In a charted area" : "Uncharted lead"}</small></h2>
      <p class="hl">${esc(l.headline)}</p>
      <div class="nums"><div><b>${l.length_m?.toFixed(0)} m</b><span>long</span></div><div><b>${l.height_m?.toFixed(1)} m</b><span>tall</span></div><div><b>${l.score?.toFixed(1)}</b><span>score</span></div><div><b>${n0 ? km(n0.m) : "-"}</b><span>nearest wreck</span></div></div>
      <ul class="nn">${l.near.map((n) => `<li><b>${km(n.m)}</b>${esc(label(n.w))}<span>${esc(n.w.kind)}</span></li>`).join("")}</ul>
      <div class="acts"><a class="primary" href="/all.html#${l.id}">Open close-up</a><a href="/all.html#compare=${l.id}">Compare with real wrecks</a></div>`;
    document.querySelectorAll("#list li").forEach((e) => e.classList.toggle("sel", e.dataset.id === l.id));
    document.querySelector("#list li.sel")?.scrollIntoView({ block: "nearest" });
    if (fit) map.fitBounds(L.latLngBounds([[l.lat, l.lon], ...l.near.map((n) => [n.w.lat, n.w.lon])]).pad(0.35), { maxZoom: 14, paddingBottomRight: [20, 20] });
  }

  $("#list").addEventListener("click", (e) => { const li = e.target.closest("li[data-id]"); if (li) select(li.dataset.id); });
  $("#oth").addEventListener("change", (e) => {
    S.others = e.target.checked;
    S.others ? otherLayer.addTo(map) : map.removeLayer(otherLayer);
    renderList();
  });
  $("#obs").addEventListener("change", (e) => { S.obs = e.target.checked; S.obs ? obsLayer.addTo(map) : map.removeLayer(obsLayer); });
  $("#rings").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.ring = +b.dataset.r;
    document.querySelectorAll("#rings button").forEach((x) => x.classList.toggle("on", x === b));
    drawRing(S.sel ? byId.get(S.sel) : null);
  });
  map.on("click", () => { if (!S.sel) return; S.sel = null; clearSel(); $("#detail").hidden = true; history.replaceState(null, "", location.pathname); renderList(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sel) { S.sel = null; clearSel(); $("#detail").hidden = true; history.replaceState(null, "", location.pathname); renderList(); } });
  addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && byId.has(id)) select(id); });

  if (!worth.length && leads.length) { $("#oth").checked = S.others = true; otherLayer.addTo(map); }
  renderList();
  const fit = worth.length ? worth : leads.length ? leads : known;
  map.fitBounds(L.latLngBounds(fit.map((l) => [l.lat, l.lon])).pad(0.15), { maxZoom: 12 });
  const h = location.hash.slice(1);
  if (h && byId.has(h)) select(h);
}

init();
