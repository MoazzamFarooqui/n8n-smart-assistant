export function fmtMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "";
  return n >= 1000 ? (n / 1000).toFixed(1) + "s" : Math.round(n) + "ms";
}

export function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

// Colour for status pills (API uses success/failed, DB uses completed/failed)
export function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "completed" || s === "active") return "#33D6A6";
  if (s === "failed" || s === "error") return "#FF6B6B";
  if (s === "running" || s === "pending") return "#FFB347";
  return "#A0A0A0";
}

export function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "success";
  return s || "unknown";
}

// Turn any value into readable text (never throws)
export function toPrettyText(value, max = 8000) {
  let text;
  if (typeof value === "string") text = value;
  else {
    try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
  }
  if (text === undefined) text = "";
  return text.length > max ? text.slice(0, max) + "\n... (truncated)" : text;
}

export function safeUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export function definitionToString(def) {
  if (def == null) return "";
  if (typeof def === "string") return def;
  try { return JSON.stringify(def, null, 2); } catch { return ""; }
}
