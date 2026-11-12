(() => {
  const DEF = "chesapeake_mouth";
  const q = new URLSearchParams(location.search).get("area");
  let a = q;
  try { if (q) localStorage.setItem("wh_area", q); else a = localStorage.getItem("wh_area"); } catch {}
  a = /^[a-z_]+$/.test(a || "") ? a : DEF;
  window.WH_AREA = a;
  const raw = window.fetch.bind(window);
  window.fetch = (u, o) => {
    if (typeof u === "string" && a !== DEF) {
      if (u.startsWith("/data/") && !u.startsWith(`/data/${a}/`)) u = `/data/${a}/` + u.slice(6);
      else if (u.startsWith("/api/")) u += (u.includes("?") ? "&" : "?") + "area=" + a;
    }
    return raw(u, o);
  };
})();
