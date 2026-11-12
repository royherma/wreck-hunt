(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const key = new URLSearchParams(location.search).get("area") || "";
  const bkk = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", minute: "2-digit" });
  let started = null, finished = false;
  const tickClock = () => {
    if (!started) return;
    const m = Math.max(0, Math.round((Date.now() - started) / 60000));
    $("#clock").innerHTML = `${m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"}<small>since ${bkk(started)} Bangkok</small>`;
  };
  const render = (a) => {
    started = Date.parse(a.started);
    $("#bname").textContent = a.name;
    document.title = `${a.name} - building`;
    if (!a.running) {
      finished = true;
      $("#blive").textContent = "";
      $("#bmeta").textContent = `Finished, ${a.leads} lead${a.leads === 1 ? "" : "s"} on the board`;
      const href = `/?data=real&area=${encodeURIComponent(a.key)}`;
      $("#done").href = href; $("#done").classList.add("on");
      $("#bsteps").querySelectorAll("li").forEach((li) => { li.className = "d"; li.querySelector(".dot").textContent = "✓"; });
      loadLive();
      return;
    }
    if (a.partial) { $("#done").href = `/?data=real&area=${encodeURIComponent(a.key)}`; $("#done").textContent = `Draft shortlist so far, ${a.leads} lead${a.leads === 1 ? "" : "s"}`; $("#done").classList.add("on"); }
    const k = a.steps.findIndex((s) => !s.done);
    $("#blive").innerHTML = `<i></i>${esc((a.steps[k] || {}).name || "Working")}`;
    $("#bmeta").textContent = `Last change ${bkk(a.updated)} Bangkok`;
    $("#bsteps").innerHTML = a.steps.map((s, i) => `<li class="${s.done ? "d" : i === k ? "c" : ""}"><span class="dot">${s.done ? "✓" : i + 1}</span><span class="nm">${esc(s.name)}</span><span class="lv">${esc(s.live || (s.done ? "done" : i === k ? "working" : ""))}</span></li>`).join("");
    $("#log").innerHTML = (a.log || []).map((l) => `<li>${esc(l).replace(/(\d{1,2}:\d{2}(:\d{2})?)/, "<span>$1</span>")}</li>`).join("") || "<li><span>nothing yet</span></li>";
  };
  const load = () => fetch("/api/areas", { cache: "no-store" }).then((r) => r.json()).then((list) => {
    const a = list.find((x) => x.key === key);
    if (!a) {
      $("#bwrap").innerHTML = `<div id="gone">No hunt is running for this area right now. Pick one from the area menu.</div>`;
      return;
    }
    render(a);
    tickClock();
    if (!finished) setTimeout(load, 4000);
  }).catch(() => setTimeout(load, 8000));
  let liveAt = 0;
  const VLAB = { "ship-like": "ship-like", maybe: "maybe", unlikely: "no" };
  const loadLive = () => fetch(`/api/live?area=${encodeURIComponent(key)}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (d && d.updated !== liveAt) {
      liveAt = d.updated;
      const ov = d.overview;
      if (ov) {
        $("#mapimg").src = `/api/live/img?area=${encodeURIComponent(key)}&f=overview.png&t=${ov.bumps}-${ov.scanned}-${ov.files}`;
        $("#mapimg").style.display = ""; $("#mapempty").style.display = "none";
        $("#mapn").textContent = `${ov.bumps.toLocaleString("en-US")} bumps, ${ov.scanned} of ${ov.files} files scanned`;
      } else { $("#mapimg").style.display = "none"; }
      $("#thn").textContent = `${d.closeups.toLocaleString("en-US")} close-ups${d.judged ? `, ${d.judged} judged` : ""}`;
      const have = new Map([...$("#thumbs").children].map((el) => [el.dataset.n, el]));
      const frag = document.createDocumentFragment();
      d.items.slice(0, 72).forEach((it) => {
        let el = have.get(String(it.n));
        const cls = it.verdict || "", html = `<img loading="lazy" src="/api/live/img?area=${encodeURIComponent(key)}&f=thumbs/${it.n}.png" alt="">${it.verdict ? `<span class="v ${cls}">${VLAB[it.verdict] || esc(it.verdict)}</span>` : ""}<figcaption>${it.len ? it.len + " m long" : "#" + it.n}${it.tall ? "<br>" + it.tall + " m tall" : ""}</figcaption>`;
        if (!el) { el = document.createElement("figure"); el.dataset.n = it.n; el.innerHTML = html; }
        else if (el.dataset.v !== cls) el.innerHTML = html;
        el.dataset.v = cls; el.className = cls;
        if (it.note) el.title = it.note;
        frag.append(el);
      });
      $("#thumbs").replaceChildren(frag);
      if (!d.items.length) $("#thumbs").innerHTML = `<div id="empty">Pictures appear as the close-ups come in.</div>`;
    }
    if (!finished) setTimeout(loadLive, 4000);
  }).catch(() => setTimeout(loadLive, 8000));
  loadLive();
  setInterval(tickClock, 30000);
  load();
})();
