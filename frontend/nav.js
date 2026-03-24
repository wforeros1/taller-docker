/* ═══════════════════════════════════════════════
   nav.js — Shared navigation & API helper
   API calls go through Nginx proxy at /api/*
   ═══════════════════════════════════════════════ */

const API = "/api";

/* ─── Page map for sidebar links ─── */
const NAV_MAP = {
  dashboard: "dashboard.html",
  clientes: "directorio.html",
  servicios: "catalogo.html",
  pagos: "gestion.html",
  disponibilidad: "disponibilidad.html",
};

/* Wire up sidebar nav links on page load */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const key = link.dataset.nav;
    if (NAV_MAP[key]) link.href = NAV_MAP[key];
  });
});

/* Fetch helper for full CRUD */
async function apiFetch(path, options = {}) {
  const url = API + path;
  const defaults = {
    headers: { "Content-Type": "application/json" },
  };

  // Merge options and stringify body if it's an object
  const finalOptions = { ...defaults, ...options };
  if (finalOptions.body && typeof finalOptions.body === "object") {
    finalOptions.body = JSON.stringify(finalOptions.body);
  }

  const res = await fetch(url, finalOptions);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `API error ${res.status}`);
  }
  // No content handling (for DELETE)
  if (res.status === 204) return null;
  return res.json();
}

/* COP currency formatter */
const fmtCOP = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

/* Initials helper */
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
