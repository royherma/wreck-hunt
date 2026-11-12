const TABS = [
  ["short", "Shortlist", () => "/?data=real"],
  ["all", "All close-ups", () => "/all.html"],
  ["cmp", "Compare", (id) => "/all.html#compare" + (id ? "=" + id : "")],
  ["map", "Map", (id) => "/map.html" + (id ? "#" + id : "")],
  ["lost", "Lost ships", () => "/lost.html"],
  ["ev", "A058 case file", () => "/docket.html"],
];
const MORE = new Set(["lost", "ev"]);

const AREA = window.WH_AREA || "chesapeake_mouth";
const withArea = (u) => (AREA === "chesapeake_mouth" ? u : u.replace(/^([^#?]*)(\?[^#]*)?/, (m, p, q) => p + (q ? q + "&" : "?") + "area=" + AREA));

const currentId = () => (location.hash.match(/^#(?:compare=)?(A\d+)/) || [])[1] || null;

function active() {
  const p = location.pathname;
  if (p.startsWith("/map")) return "map";
  if (p.startsWith("/lost")) return "lost";
  if (p.startsWith("/build")) return "build";
  if (p.startsWith("/docket")) return "ev";
  if (p.startsWith("/all")) return document.querySelector("#cmpview:not([hidden])") ? "cmp" : "all";
  return "short";
}

const css = `#wtabs{position:fixed;top:0;right:14px;height:36px;z-index:2147483001;display:flex;align-items:center;gap:2px;font:600 12.5px/1 "Public Sans",system-ui,sans-serif}
#wtabs a{color:#5B7482;text-decoration:none;padding:7px 10px;border-radius:999px;white-space:nowrap}
#wtabs a:hover{color:#13202A;background:rgba(31,78,107,.08)}
#wtabs a[aria-current=page]{color:#fff;background:#1F4E6B}
#wtabs select{font:inherit;color:#13202A;background:#fff;border:1px solid rgba(31,78,107,.25);border-radius:999px;padding:5px 8px;margin-right:6px;max-width:220px}
#wtabs a:focus-visible{outline:2px solid #13202A;outline-offset:1px}
#warea{position:relative;margin-right:6px}
#warea>button{font:inherit;color:#13202A;background:#fff;border:1px solid rgba(31,78,107,.25);border-radius:999px;padding:5px 10px 5px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;max-width:300px}
#warea>button:hover{border-color:#1F4E6B}
#warea>button b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
#warea>button i{font:italic 500 13px "Newsreader",serif;color:#A3197F;white-space:nowrap}
#warea>button svg{flex:none;transition:transform .15s}
#warea.open>button svg{transform:rotate(180deg)}
#wpanel{position:absolute;top:calc(100% + 6px);right:0;width:500px;background:#fff;border:1px solid rgba(31,78,107,.22);border-radius:12px;box-shadow:0 14px 40px rgba(19,32,42,.18);padding:8px;display:none}
#warea.open #wpanel{display:block}
#wpanel .hd{font:600 11px "Public Sans",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5B7482;padding:4px 8px 8px}
#wpanel a.ar{display:grid;grid-template-columns:22px 1fr auto;gap:2px 10px;padding:9px 10px;border-radius:9px;color:#13202A;position:relative;white-space:normal}
#wpanel a.ar:hover{background:rgba(31,78,107,.07)}
#wpanel a.ar[aria-current]{background:rgba(31,78,107,.1);color:#13202A}
#wpanel .n{grid-row:1/4;width:22px;height:22px;border-radius:50%;border:1.5px solid #1F4E6B;color:#1F4E6B;font:italic 600 13px/19px "Newsreader",serif;text-align:center;background:#fff;position:relative;z-index:1}
#wpanel a.ar:not(:last-child) .n::after{content:"";position:absolute;left:9px;top:21px;width:1px;height:50px;background:rgba(31,78,107,.25);z-index:-1}
#wpanel .nm{font:600 13.5px/1.25 "Public Sans",sans-serif}
#wpanel .when{grid-column:2/4;font:500 11.5px/1.3 "Public Sans",sans-serif;color:#5B7482}
#wpanel .meta{grid-column:2/4;display:flex;gap:12px;font:500 11.5px "Public Sans",sans-serif;color:#5B7482;flex-wrap:wrap}
#wpanel .meta i{font:italic 500 14px "Newsreader",serif;color:#13202A}
#wpanel .res{grid-row:1;grid-column:3;font:600 11.5px "Public Sans",sans-serif;display:flex;gap:6px;align-items:center;white-space:nowrap}
#wpanel .dot{width:9px;height:9px;border-radius:50%;display:inline-block;border:1.5px solid #A3197F}
#wpanel .dot.f{background:#A3197F}
#wpanel .none{color:#8A9BA5;font-weight:500}
#wpanel .run{color:#A3197F;display:flex;align-items:center;gap:6px}
#wpanel .pulse,#warea>button .pulse{width:8px;height:8px;border-radius:50%;background:#A3197F;display:inline-block;animation:whp 1.2s ease-in-out infinite}
@keyframes whp{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
#wpanel .bar{grid-column:2/4;display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:4px}
#wpanel .bar span{height:4px;border-radius:2px;background:rgba(31,78,107,.15)}
#wpanel .bar span.d{background:#1F4E6B}
#wpanel .bar span.c{background:#A3197F;animation:whp 1.2s ease-in-out infinite}
#wmore{position:relative}
#wmore>button{font:inherit;color:#5B7482;background:none;border:0;padding:7px 10px;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:6px}
#wmore>button:hover,#wmore.open>button{color:#13202A;background:rgba(31,78,107,.08)}
#wmore.cur>button{color:#fff;background:#1F4E6B}
#wmore .mp{position:absolute;top:calc(100% + 6px);right:0;min-width:180px;background:#fff;border:1px solid rgba(31,78,107,.22);border-radius:12px;box-shadow:0 14px 40px rgba(19,32,42,.18);padding:6px;display:none;flex-direction:column}
#wmore.open .mp{display:flex}
#wmore .mp a{border-radius:8px}
@media (max-width:900px){#wtabs{display:none}}`;

function mount() {
  const st = document.createElement("style");
  st.textContent = css;
  document.head.append(st);
  const nav = document.createElement("nav");
  nav.id = "wtabs";
  nav.setAttribute("aria-label", "Wreck Hunt views");
  const tabs = TABS.filter(([k]) => k !== "ev" || AREA === "chesapeake_mouth");
  const caret = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg>`;
  nav.innerHTML = `<div id="warea"><button type="button" aria-haspopup="true" aria-expanded="false" aria-label="Search area"><b>${AREA}</b>${caret}</button><div id="wpanel" role="menu"></div></div>` + tabs.filter(([k]) => !MORE.has(k)).map(([k, label]) => `<a href="#" data-k="${k}">${label}</a>`).join("")
    + `<div id="wmore"><button type="button" aria-haspopup="true" aria-expanded="false">More${caret}</button><div class="mp">${tabs.filter(([k]) => MORE.has(k)).map(([k, label]) => `<a href="#" data-k="${k}">${label}</a>`).join("")}</div></div>`;
  const box = nav.querySelector("#warea"), btn = box.querySelector("button"), panel = box.querySelector("#wpanel");
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const when = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Bangkok", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Bangkok" : "";
  const num = (v) => (v == null ? "-" : Number(v).toLocaleString("en-US"));
  const hrefFor = (key) => { const u = new URL(location.href); u.searchParams.set("area", key); u.searchParams.delete("lead"); u.hash = ""; return u.toString(); };
  const result = (a) => a.shiplike || a.maybe
    ? (a.shiplike ? `<span class="dot f"></span>${a.shiplike} ship-like` : "") + (a.maybe ? `<span class="dot"></span>${a.maybe} maybe` : "")
    : `<span class="none">nothing kept</span>`;
  const row = (a, i) => {
    if (!a.running) return `<a class="ar" role="menuitem" href="${hrefFor(a.key)}"${a.key === AREA ? ' aria-current="page"' : ""}>
      <span class="n">${i + 1}</span><span class="nm">${esc(a.name)}</span><span class="res">${result(a)}</span>
      <span class="when">Started ${when(a.started)}</span><span class="meta"><span><i>${num(a.km2)}</i> km² of ${esc(a.source)} sonar</span><span><i>${num(a.closeups)}</i> close-ups looked at</span></span></a>`;
    const k = a.steps.findIndex((s) => !s.done), cur = a.steps[k] || a.steps[a.steps.length - 1];
    return `<a class="ar" role="menuitem" href="/build.html?area=${a.key}">
      <span class="n">${i + 1}</span><span class="nm">${esc(a.name)}</span><span class="res run"><span class="pulse"></span>building now</span>
      <span class="when">Started ${when(a.started)} · now: ${esc(cur.name)}${cur.live ? ", " + esc(cur.live) : ""}</span>
      <span class="bar">${a.steps.map((s, j) => `<span class="${s.done ? "d" : j === k ? "c" : ""}"></span>`).join("")}</span></a>`;
  };
  let timer = null;
  const load = () => fetch("/api/areas", { cache: "no-store" }).then((r) => r.json()).then((list) => {
    const cur = list.find((a) => a.key === AREA), busy = list.some((a) => a.running);
    if (cur?.running && !cur.partial && !location.pathname.startsWith("/build")) { location.replace(`/build.html?area=${AREA}`); return; }
    if (cur) btn.innerHTML = `<b>${esc(cur.name)}</b>${cur.running ? `<i>building</i>` : `<i>${cur.leads} lead${cur.leads === 1 ? "" : "s"}</i>`}${busy ? `<span class="pulse" title="A hunt is running"></span>` : ""}${caret}`;
    panel.innerHTML = `<div class="hd">Search areas, oldest first</div>` + list.map(row).join("");
    clearTimeout(timer);
    if (busy) timer = setTimeout(load, 4000);
  }).catch(() => {});
  load();
  const setOpen = (v) => { box.classList.toggle("open", v); btn.setAttribute("aria-expanded", String(v)); };
  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(!box.classList.contains("open")); });
  const more = nav.querySelector("#wmore"), mbtn = more.querySelector("button");
  const setMore = (v) => { more.classList.toggle("open", v); mbtn.setAttribute("aria-expanded", String(v)); };
  mbtn.addEventListener("click", (e) => { e.stopPropagation(); setMore(!more.classList.contains("open")); });
  document.addEventListener("click", (e) => { if (!box.contains(e.target)) setOpen(false); if (!more.contains(e.target)) setMore(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { setOpen(false); setMore(false); } });
  panel.addEventListener("click", (e) => { try { localStorage.setItem("wh_area", new URL(e.target.closest("a").href).searchParams.get("area")); } catch {} });
  document.body.append(nav);
  const sync = () => {
    const a = active(), id = currentId();
    nav.querySelectorAll("a[data-k]").forEach((el) => {
      const t = TABS.find((x) => x[0] === el.dataset.k);
      el.href = withArea(t[2](id));
      el.toggleAttribute("aria-current", el.dataset.k === a);
      if (el.dataset.k === a) el.setAttribute("aria-current", "page");
    });
    nav.querySelector("#wmore").classList.toggle("cur", MORE.has(a));
  };
  nav.addEventListener("mouseover", sync);
  nav.addEventListener("focusin", sync);
  addEventListener("hashchange", sync);
  const follow = () => { nav.style.top = Math.min(0, -scrollY) + "px"; };
  addEventListener("scroll", follow, { passive: true });
  follow();
  new MutationObserver(sync).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  sync();
}

if (document.body) mount();
else addEventListener("DOMContentLoaded", mount);
