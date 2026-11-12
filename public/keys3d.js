import * as THREE from "three";

const held = new Set(), users = [];
export const useKeys = (active) => users.push(active);
const MOVE = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
const typing = () => { const el = document.activeElement; return el?.tagName === "TEXTAREA" || (el?.tagName === "INPUT" && !["checkbox", "range", "radio", "button"].includes(el.type)); };
addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
  const k = e.key.toLowerCase();
  if (!(k in MOVE || k === "q" || k === "e") || !users.some((u) => u())) return;
  held.add(k);
  e.shiftKey ? held.add("shift") : held.delete("shift");
  e.preventDefault();
});
addEventListener("keyup", (e) => { held.delete(e.key.toLowerCase()); if (e.key === "Shift") held.delete("shift"); });
addEventListener("blur", () => held.clear());

const f = new THREE.Vector3(), r = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), off = new THREE.Vector3();

export function keyStep(camera, controls, dt, active) {
  if (!active() || !held.size) return false;
  let mx = 0, my = 0;
  for (const k of held) if (MOVE[k]) { mx += MOVE[k][0]; my += MOVE[k][1]; }
  const dist = camera.position.distanceTo(controls.target);
  const speed = dist * 0.9 * (held.has("shift") ? 3 : 1) * dt;
  if (mx || my) {
    camera.getWorldDirection(f); f.y = 0; f.normalize();
    r.crossVectors(f, up).normalize();
    const step = f.multiplyScalar(my * speed).add(r.multiplyScalar(mx * speed));
    camera.position.add(step); controls.target.add(step);
  }
  const turn = (held.has("e") ? 1 : 0) - (held.has("q") ? 1 : 0);
  if (turn) {
    off.subVectors(camera.position, controls.target).applyAxisAngle(up, -turn * 1.4 * dt);
    camera.position.copy(controls.target).add(off);
  }
  return true;
}

export const keysHeld = () => held.size > 0;
