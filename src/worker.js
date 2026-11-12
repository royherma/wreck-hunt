const DEF = "chesapeake_mouth";
const AREA = /^[a-z_]{2,40}$/, ID = /^[A-Z]\d{2,4}$/;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const r1 = (n) => Math.round(n * 10) / 10;
const labelOf = (it) => (it.group === "charted" ? it.vessel?.name || `Charted ${it.id}` : it.id);
const STATE = ["view", "lay", "size", "around", "stretch"];

const notFound = () => new Response('<!doctype html><meta charset=utf-8><title>Not found</title><p>That finding is not on the board. <a href="/">Wreck Hunt</a></p>', { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });

async function asset(env, url, path) {
  const r = await env.ASSETS.fetch(new URL(path, url));
  return r.ok ? r : null;
}

function describe(items, areaName) {
  if (items.length === 1) {
    const it = items[0], size = `${Math.round(it.length_m)} m long, ${r1(it.height_m)} m tall`;
    if (it.group === "charted") return {
      title: `${labelOf(it)}: a real wreck, ${size}`,
      desc: `Found again by a scanner reading public sonar off ${areaName}. Turn it in 3D and set it next to the new finds`,
    };
    return {
      title: `Is this a shipwreck? ${size}, on no chart`,
      desc: `A hard bump in public sonar off ${areaName}. Turn it in 3D and compare it with real wrecks at the same scale`,
    };
  }
  const names = items.map(labelOf);
  return {
    title: `Which of these is a shipwreck? ${items.length} shapes, same scale`,
    desc: `${names.slice(0, 6).join(", ")}${names.length > 6 ? " and more" : ""}, off ${areaName}. Open it and turn them in 3D`,
  };
}

async function share(request, env, kind, area, idsRaw) {
  const url = new URL(request.url);
  const ids = idsRaw.split(",").filter((x) => ID.test(x)).slice(0, 12);
  if (!AREA.test(area) || !ids.length || (kind === "f" && ids.length !== 1)) return notFound();
  const base = area === DEF ? "/data/" : `/data/${area}/`;
  const [allR, huntR] = await Promise.all([asset(env, url, base + "all.json"), asset(env, url, base + "hunt.json")]);
  if (!allR) return notFound();
  const all = await allR.json(), hunt = huntR ? await huntR.json() : {};
  const byId = new Map(all.items.map((i) => [i.id, i]));
  const items = ids.map((i) => byId.get(i)).filter(Boolean);
  if (!items.length) return notFound();
  const { title, desc } = describe(items, hunt.area?.name || area);
  const q = new URLSearchParams({ area });
  for (const k of STATE) if (url.searchParams.get(k)) q.set(k, url.searchParams.get(k));
  const target = `/all?${q}#${items.length === 1 && kind === "f" ? items[0].id : "compare=" + items.map((i) => i.id).join(",")}`;
  const pick = items.find((i) => i.group !== "charted") || items[0];
  const card = `/cards/${area}/${pick.id}.png`;
  const image = new URL((await asset(env, url, card)) ? card : "/brand/og.png", url).toString();
  const page = await env.ASSETS.fetch(new URL("/all", url));
  const set = (sel, v) => [sel, { element: (e) => e.setAttribute("content", v) }];
  const rw = new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(`${title} - Wreck Hunt`) })
    .on(...set('meta[property="og:title"]', title))
    .on(...set('meta[property="og:description"]', desc))
    .on(...set('meta[name="description"]', desc))
    .on(...set('meta[property="og:image"]', image))
    .on(...set('meta[name="twitter:image"]', image))
    .on("head", { element: (e) => e.prepend(`<script>location.replace(${JSON.stringify(target)})</script><meta property="og:url" content="${esc(url.toString())}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">`, { html: true }) });
  const res = rw.transform(page);
  return new Response(res.body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}

export default {
  async fetch(request, env) {
    const m = new URL(request.url).pathname.match(/^\/(f|c)\/([^/]+)\/([^/?#]+)\/?$/);
    if (m) return share(request, env, m[1], m[2], decodeURIComponent(m[3]));
    return env.ASSETS.fetch(request);
  },
};
