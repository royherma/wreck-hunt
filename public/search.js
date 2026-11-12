import { loadHf, paintThumb, f1, sc } from "/lib.js";

const num = (s) => { const m = /(\d+)/.exec(s || ""); return m ? parseInt(m[1], 10) : null; };

export function textOf(parts) { return parts.filter(Boolean).join(" ").toLowerCase(); }

export function rank(entries, qRaw) {
  const q = qRaw.trim().toLowerCase();
  if (!q) return [];
  const toks = q.split(/\s+/);
  const digits = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const out = [];
  for (const e of entries) {
    let s = 0;
    const ids = e.ids.map((x) => x.toLowerCase());
    if (ids.includes(q)) s = 100;
    else if (digits != null && e.ids.some((x) => num(x) === digits)) s = 90;
    else if (q.length >= 2 && ids.some((x) => x.startsWith(q))) s = 80;
    else if (toks.every((t) => e.text.includes(t))) s = 40 + (e.title && toks.every((t) => e.title.toLowerCase().includes(t)) ? 10 : 0) + (e.name && e.name.toLowerCase().includes(q) ? 15 : 0);
    if (s) out.push([s + (e.score || 0) / 100, e]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, 8).map((x) => x[1]);
}

export function mountSearch(input, { entries, open, canFocus = () => true }) {
  const dd = document.createElement("div");
  dd.className = "sdrop";
  dd.hidden = true;
  dd.setAttribute("role", "listbox");
  document.body.append(dd);
  let hits = [], at = 0;

  const place = () => {
    const r = input.getBoundingClientRect();
    dd.style.left = Math.min(r.left, innerWidth - 380) + "px";
    dd.style.top = r.bottom + 4 + "px";
  };
  const close = () => { dd.hidden = true; };
  const draw = () => {
    if (!hits.length) {
      dd.hidden = !input.value.trim();
      dd.innerHTML = input.value.trim() ? '<div class="snone">No match. Try an id like A009, a name or a word like scour</div>' : "";
      place();
      return;
    }
    place();
    dd.hidden = false;
    dd.innerHTML = hits.map((e, i) => `<div class="srow" role="option" data-i="${i}" aria-selected="${i === at}"><canvas width="44" height="30"></canvas><span class="sid">${e.ids.slice(0, 2).join(" ")}</span><span class="stx">${e.title || ""}</span><i>${e.score != null ? sc(e.score) : ""}</i></div>`).join("");
    dd.querySelectorAll(".srow").forEach((row, i) => {
      const e = hits[i];
      if (e.item) loadHf(e.item).then((hf) => hf && paintThumb(row.querySelector("canvas"), hf, 0.62));
      row.addEventListener("mousedown", (ev) => { ev.preventDefault(); pick(i); });
      row.addEventListener("mousemove", () => { at = i; mark(); });
    });
  };
  const mark = () => dd.querySelectorAll(".srow").forEach((r, i) => r.setAttribute("aria-selected", String(i === at)));
  const pick = (i) => { const e = hits[i]; if (!e) return; close(); input.blur(); input.value = ""; open(e); };

  input.addEventListener("input", () => { hits = rank(entries(), input.value); at = 0; draw(); });
  input.addEventListener("focus", () => { if (input.value) { hits = rank(entries(), input.value); draw(); } });
  input.addEventListener("blur", () => setTimeout(close, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); at = Math.min(at + 1, hits.length - 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); at = Math.max(at - 1, 0); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(at); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); input.value = ""; close(); input.blur(); }
    e.stopPropagation();
  });
  addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
    const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
    if ((cmdK || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) && canFocus()) {
      e.preventDefault(); e.stopImmediatePropagation();
      input.focus(); input.select();
    }
  }, true);
  addEventListener("resize", place);
}
