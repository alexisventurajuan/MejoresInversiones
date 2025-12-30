export function $(id) {
  return document.getElementById(id);
}

export function toNumber(value) {
  if (value === null || value === undefined) return 0;
  const s = String(value).replace(/[$,%\s]/g, "").replaceAll(",", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Convierte texto a número:
 * - admite "$", ",", "%", espacios
 * - si está vacío => NaN (para validar)
 */
export function toNumberStrict(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;
  const s = raw.replace(/[$,%\s]/g, "").replaceAll(",", "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function money(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export function normalizePct(p) {
  if (!Number.isFinite(p)) return NaN;
  if (p > 1) return p / 100;
  return p;
}

export function pct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

export function fmtTir(x) {
  if (x === null || x === undefined) return "—";
  if (!Number.isFinite(x)) return "—";
  return pct(x);
}

export function alertAndReturn(msg) {
  alert(msg);
  return null;
}
