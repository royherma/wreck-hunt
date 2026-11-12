import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { G, VERT, FRAG, resample } from "/lib.js";
import { keyStep, useKeys } from "/keys3d.js";

const FRAG3 = "uniform vec3 uLine; uniform float uRad, uStack, uFi, uHole, uNoLine, uMark;\n" + FRAG
  .replace("float fade = 1.0 - smoothstep(uR0, min(uR0 + 0.43, 1.0), r);", "float fade = 1.0 - smoothstep(uRad * uFi, uRad, length(vP.xz));")
  .replace("col = mix(col, vec3(0.639, 0.098, 0.498), line * on * 0.9);", "col = mix(col, uLine, line * on * 0.9);")
  .replace("if (fade <= 0.001) discard;", "if (fade <= 0.001) discard;\n  if (uStack > 0.5 && vH < 0.3) discard;\n  if (length(vP.xz) < uHole) discard;")
  .replace("float on = smoothstep(0.3, 0.55, vH);", "float on = smoothstep(0.3, 0.55, vH) * (1.0 - uNoLine);")
  .replace("gl_FragColor = vec4(col, a);", "if (uStack > 0.5) { col = mix(col, uLine, 0.5); a *= 0.6; }\n  if (uMark > 0.5) { float rr = abs(length(vP.xz) - uMark); col = mix(col, uLine, (1.0 - smoothstep(0.0, 1.5 * fwidth(length(vP.xz)) + 0.3, rr)) * 0.85); }\n  gl_FragColor = vec4(col, a);");

let R = null;
const known = (it) => it.group === "charted";

function init(canvas, layer) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 6000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.45;
  controls.screenSpacePanning = false;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(G * G * 3), idx = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const o = (j * G + i) * 3;
    pos[o] = i / (G - 1) - 0.5; pos[o + 2] = j / (G - 1) - 0.5;
    if (i < G - 1 && j < G - 1) { const a = j * G + i, b = a + 1, c = a + G, d = c + 1; idx.push(a, c, b, b, c, d); }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  R = { renderer, scene, camera, controls, geo, canvas, layer, groups: [], on: false, key: "", hidden: new Set() };
  const size = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  R.size = size;
  new ResizeObserver(size).observe(canvas);
  const v = new THREE.Vector3();
  useKeys(() => R.on);
  let last = performance.now();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const dt = Math.min(((now || performance.now()) - last) / 1000, 0.1); last = now || performance.now();
    if (!R.on) return;
    keyStep(camera, controls, dt, () => R.on);
    controls.update();
    renderer.render(scene, camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const g of R.groups) {
      if (g.fixed) { g.label.style.transform = ""; continue; }
      v.set(g.obj.position.x, 0, g.front).project(camera);
      g.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, 2px)`;
    }
  };
  requestAnimationFrame(tick);
}

function clear() {
  for (const g of R.groups) {
    R.scene.remove(g.obj);
    g.mesh.material.dispose();
    g.tex.dispose();
    for (const e of g.extra || []) { e.mesh.material.dispose(); e.tex.dispose(); }
  }
  R.groups = [];
  R.layer.innerHTML = "";
}

export function hide3d() {
  if (R) R.on = false;
}

export function show3d({ canvas, layer, items, cols, hfs, cens, stretch, label, tag, onOpen, stack, match, reserve = 0, wides = null }) {
  if (!R) init(canvas, layer);
  R.on = true;
  R.size();
  const maxH = Math.max(...items.map((it) => it.height_m || 1));
  const ex = stretch ? stretch : Math.min(Math.max(14 / maxH, 2), 6);
  const sizes = items.map((it) => { const h = hfs.get(it.id); return Math.max(h.w, h.h) * (h.cell_m || 4); });
  const wd = items.map((it) => wides?.get(it.id) || null);
  const wsz = wd.map((h) => (h ? Math.max(h.w, h.h) * (h.cell_m || 4) : 0));
  const sig = items.map((x) => x.id).join(",") + "|" + wsz.join(",") + "|" + ex + "|" + cols.join(",") + "|" + stack + "|" + match;
  if (sig === R.sig) return;
  R.sig = sig;
  clear();
  const rad = items.map((it, i) => (wd[i] ? wsz[i] / 2 : (it.length_m || 40) / 2 + 9));
  const maxL = Math.max(...items.map((it) => it.length_m || 40));
  const k = items.map((it) => (match ? maxL / (it.length_m || 40) : 1));
  const gap = Math.max(...rad.map((r, i) => r * k[i])) * 2 + 2;
  const x0 = stack ? 0 : -((items.length - 1) * gap) / 2;
  R.layer.classList.toggle("stack", !!stack);
  const mk = (hf, col, u) => {
    const tex = new THREE.DataTexture(resample(hf), G, G, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const uniforms = {
      uA: { value: tex }, uB: { value: tex }, uMix: { value: 1 }, uEx: { value: ex }, uSize: { value: Math.max(hf.w, hf.h) * (hf.cell_m || 4) },
      uR0: { value: 0.5 }, uSweep: { value: 2 }, uLine: { value: new THREE.Vector3(col.r, col.g, col.b) }, uStack: { value: stack ? 1 : 0 },
      uRad: { value: u.rad }, uFi: { value: u.fi }, uHole: { value: u.hole || 0 }, uNoLine: { value: u.noLine || 0 }, uMark: { value: u.mark || 0 },
    };
    const mesh = new THREE.Mesh(R.geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG3, transparent: true, side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    mesh.material.depthWrite = !stack;
    return { mesh, tex };
  };
  const at = (hf, x, y) => { const i = Math.min(hf.w - 1, Math.max(0, Math.round(x))), j = Math.min(hf.h - 1, Math.max(0, Math.round(y))); return hf.z[j * hf.w + i] ?? 0; };
  items.forEach((it, i) => {
    const hf = hfs.get(it.id), c = cens.get(it.id), cell = hf.cell_m || 4;
    const size = sizes[i], col = new THREE.Color(cols[i]), w = wd[i];
    const inner = size / 2 * 0.96;
    const near = mk(hf, col, w ? { rad: inner, fi: 0.97 } : { rad: Math.min(rad[i], size / 2), fi: 0.72 });
    near.mesh.renderOrder = known(it) ? 1 : 2;
    const mx = (c.cx / (hf.w - 1) - 0.5) * size, mz = (c.cy / (hf.h - 1) - 0.5) * size;
    const spin = new THREE.Group();
    spin.rotation.y = (((it.heading_deg || 0) - 90) * Math.PI) / 180;
    spin.add(near.mesh);
    const extra = [];
    if (w) {
      const wc = w.cell_m || 4, r = inner * 0.92;
      let dw = 0, dn = 0;
      for (let a = 0; a < 24; a++) {
        const t = (a / 24) * Math.PI * 2, ox = Math.cos(t) * r, oz = Math.sin(t) * r;
        dw += at(w, (w.w - 1) / 2 + ox / wc, (w.h - 1) / 2 + oz / wc);
        dn += at(hf, c.cx + ox / cell, c.cy + oz / cell);
      }
      const off = (dw - dn) / 24;
      const far = mk({ ...w, z: w.z.map((v) => v - off) }, col, { rad: wsz[i] / 2, fi: 0.95, hole: inner * 0.985, noLine: 1, mark: inner });
      far.mesh.renderOrder = 0;
      spin.add(far.mesh);
      extra.push(far);
    }
    near.mesh.position.set(-mx, 0, -mz);
    const mesh = near.mesh, tex = near.tex;
    const obj = new THREE.Group();
    obj.position.set(stack ? 0 : x0 + i * gap, 0, 0);
    obj.scale.set(k[i], 1, k[i]);
    obj.add(spin);
    obj.visible = !R.hidden.has(it.id);
    R.scene.add(obj);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "l3" + (obj.visible ? "" : " off");
    el.innerHTML = `<i class="sw" style="background:${cols[i]}"></i>${label(it)} ${tag(it)}`;
    el.title = "Click to hide or show, double-click to open";
    el.addEventListener("click", () => { obj.visible = !obj.visible; el.classList.toggle("off", !obj.visible); obj.visible ? R.hidden.delete(it.id) : R.hidden.add(it.id); });
    el.addEventListener("dblclick", () => onOpen(it));
    R.layer.append(el);
    R.groups.push({ obj, mesh, tex, extra, label: el, front: rad[i] * 0.8 * k[i], fixed: !!stack });
  });
  const key = items.map((x) => x.id).join(",") + wsz.join(",") + stack + match + reserve;
  if (key !== R.key) {
    R.key = key;
    const span = stack ? gap : (items.length - 1) * gap + gap;
    const vf = (R.camera.fov * Math.PI) / 360;
    const w = R.canvas.clientWidth || 1, h = R.canvas.clientHeight || 1;
    const hf = Math.atan(Math.tan(vf) * (w - reserve) / h), hfull = Math.atan(Math.tan(vf) * w / h);
    const d = stack ? Math.max(gap / (0.9 * Math.tan(hf)), (gap * 0.45) / Math.tan(vf)) : Math.max(span / 2 / Math.tan(hf), gap * 0.8 / Math.tan(vf)) * 0.8;
    const pol = stack ? 1.1 : 1.0, sx = (reserve / w) * d * Math.tan(hfull) * 0.75;
    R.controls.target.set(sx, 0, 0);
    R.camera.position.set(sx, d * Math.cos(pol), d * Math.sin(pol));
    R.camera.lookAt(sx, 0, 0);
    R.controls.autoRotate = false;
  }
}

export function fit3d() {
  if (R) { R.key = ""; R.sig = ""; }
}

