(async () => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const area = window.WH_AREA && window.WH_AREA !== "chesapeake_mouth" ? "&area=" + window.WH_AREA : "";
  let d = null;
  try { const r = await fetch("/data/missing.json", { cache: "no-store" }); d = r.ok ? await r.json() : null; } catch {}
  const ships = d?.ships || [];
  if (!ships.length) {
    $("#lsub").textContent = "";
    $("#ships").innerHTML = `<div id="none">No list of missing ships for this area yet. Pick Bayfield or Apollo Bay in the area menu.</div>`;
    return;
  }
  const unf = ships.filter((s) => s.status.startsWith("unfound")).length;
  const fit = ships.filter((s) => s.could_be?.length).length;
  $("#lsub").innerHTML = `<b>${ships.length}</b> ships lost near ${esc(d.area)} from the ${esc(d.source)}. <b>${unf}</b> still unfound${fit ? `, <b>${fit}</b> with a lead of a matching size` : ""}. Sizes are the ship when new; a broken wreck is shorter.`;
  $("#ships").innerHTML = ships.map((s) => {
    const u = s.status.startsWith("unfound");
    const facts = [s.type, s.length_m && `<i>${s.length_m}</i> m long`, s.tons && `<i>${s.tons.toLocaleString("en-US")}</i> tons`, s.cargo && `cargo: ${esc(s.cargo)}`, s.where && esc(s.where)].filter(Boolean);
    const leads = (s.could_be || []).map((x) => x.split(" ")[0]);
    return `<article class="ship${u ? " unf" : ""}">
      <h3>${esc(s.name)}${s.year ? `<span class="y">${s.year}</span>` : ""}</h3>
      <div class="facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>
      ${s.story ? `<div class="story">${esc(s.story)}</div>` : ""}
      <div class="row"><span class="pill${u ? " unf" : ""}">${esc(s.status)}</span>
        ${leads.length ? `<span class="fit">Size could match ${leads.map((l) => `<a href="/?data=real&lead=${l}${area}">${l}</a>`).join(", ")}</span>` : ""}
        <span class="grow"></span>${s.source ? `<a class="src" href="${esc(s.source)}" target="_blank" rel="noopener">source</a>` : ""}</div>
    </article>`;
  }).join("");
})();
