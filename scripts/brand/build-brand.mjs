import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
const B = process.argv[2];
const mark = readFileSync(B + "/mark.svg", "utf8");
const hull = "data:image/png;base64," + readFileSync(new URL("./hull-source.png", import.meta.url)).toString("base64");
const fonts = `<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@1,6..72,500&family=Public+Sans:wght@600;800&display=swap" rel="stylesheet">`;
const card = (w, h, hook, line) => `<!doctype html><html><head>${fonts}<style>
*{margin:0;box-sizing:border-box}
body{width:${w}px;height:${h}px;overflow:hidden;background:#13202A;font-family:"Public Sans",sans-serif;position:relative}
.bg{position:absolute;inset:0;background:url(${hull}) no-repeat;background-size:${Math.round(w * 1.3)}px auto;background-position:${Math.round(w * 0.73 - 1015 / 2002 * w * 1.3)}px ${Math.round(h * 0.52 - 690 / 2002 * w * 1.3)}px}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,#13202A 0%,rgba(19,32,42,.96) 40%,rgba(19,32,42,.2) 56%,rgba(19,32,42,0) 64%)}
.txt{position:absolute;left:${Math.round(w * .06)}px;top:0;bottom:0;width:${Math.round(w * .46)}px;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(h * .045)}px}
.brand{display:flex;align-items:center;gap:14px;color:#D3E8F1;font-weight:600;font-size:${Math.round(h * .042)}px;letter-spacing:.01em}
.brand svg{width:${Math.round(h * .075)}px;height:${Math.round(h * .075)}px}
h1{color:#fff;font-weight:800;font-size:${Math.round(h * .1)}px;line-height:1.02;letter-spacing:-.025em}
h1 em{font-style:normal;color:#F07AB8}
p{font:italic 500 ${Math.round(h * .046)}px/1.25 Newsreader,serif;color:#A9CFE1;max-width:92%}
.tag{position:absolute;right:${Math.round(w * .07)}px;bottom:${Math.round(h * .1)}px;font:600 ${Math.round(h * .03)}px "Public Sans";color:#13202A;background:rgba(246,249,250,.92);border-left:3px solid #A3197F;padding:8px 12px}
</style></head><body><div class="bg"></div><div class="fade"></div>
<div class="txt"><div class="brand">${mark}Wreck Hunt</div><h1>${hook}</h1><p>${line}</p></div>
<div class="tag">Charted wreck, 75 m long, 13 m down</div></body></html>`;
const icon = (s) => `<!doctype html><html><body style="margin:0;width:${s}px;height:${s}px;background:transparent">${mark.replace("<svg ", `<svg width="${s}" height="${s}" `)}</body></html>`;
const b = await chromium.launch();
const shot = async (html, w, h, out, omitBackground = false) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html, { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out, omitBackground, type: out.endsWith(".jpg") ? "jpeg" : "png", ...(out.endsWith(".jpg") ? { quality: 88 } : {}) });
  await p.close();
};
const HOOK = "Lost ships are hiding in <em>public sonar</em>";
const LINE = "The scanner found 72 of 80 charted wrecks again with no hints. Then it kept going";
await shot(card(1200, 630, HOOK, LINE), 1200, 630, B + "/og.png");
await shot(card(1280, 640, HOOK, LINE), 1280, 640, B + "/social.png");
for (const s of [32, 180, 512]) await shot(icon(s), s, s, `${B}/icon-${s}.png`, true);
await shot(card(1200, 630, HOOK, LINE), 1200, 630, B + "/og-300.png");
await b.close();
console.log("ok");
