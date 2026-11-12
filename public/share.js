export const ORIGIN = "https://wreckhunt.techguyverlabs.org";

const area = () => window.WH_AREA || "chesapeake_mouth";

export function shareUrl(ids, state = {}) {
  const q = new URLSearchParams(Object.entries(state).filter(([, v]) => v != null && v !== "")).toString();
  return `${ORIGIN}/${ids.length === 1 ? "f" : "c"}/${area()}/${ids.join(",")}${q ? "?" + q : ""}`;
}

export async function copyShare(btn, url) {
  const was = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = "Link copied";
  } catch {
    window.prompt("Copy this link", url);
  }
  setTimeout(() => (btn.textContent = was), 1800);
}
