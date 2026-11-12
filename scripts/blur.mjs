export const CELL = Number(process.env.PUBLIC_CELL_KM) || 20;

export const blur = (it) => {
  if (it.group === "charted" || it.my_verdict === "charted") return it;
  const out = { ...it };
  if (it.where) {
    const snap = (v) => Math.floor(v / CELL) * CELL + CELL / 2;
    out.where = { x_km: snap(it.where.x_km), y_km: snap(it.where.y_km), cell_km: CELL, text: `somewhere in this ${CELL} km square` };
  }
  if (it.depth_m != null) out.depth_m = Math.round(it.depth_m / 5) * 5;
  if (it.nearest_charted_km != null) out.nearest_charted_km = Math.max(5, Math.ceil(it.nearest_charted_km / 5) * 5);
  return out;
};
export const blurHunt = (h) => ({ ...h, leads: (h.leads || []).map(blur) });
export const blurAll = (a) => ({ ...a, items: (a.items || []).map(blur) });
