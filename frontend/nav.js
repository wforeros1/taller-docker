/* ═══════════════════════════════════════════════
   nav.js — Shared navigation & API helper
   API calls go through Nginx proxy at /api/*
   ═══════════════════════════════════════════════ */

const API = "/api";

/* ─── Route Guard: Protection of Views ─── */
const isLoginPage = window.location.pathname.endsWith('login.html');
const token = localStorage.getItem('alquimia_token');

if (!token && !isLoginPage) {
  window.location.href = "login.html";
} else if (token && isLoginPage) {
  window.location.href = "dashboard.html";
}

/* ─── Page map for sidebar links ─── */
const NAV_MAP = {
  dashboard: "dashboard.html",
  clientes: "directorio.html",
  servicios: "catalogo.html",
  pagos: "gestion.html",
  disponibilidad: "disponibilidad.html",
};

/* Wire up sidebar nav links and session widgets on page load */
document.addEventListener("DOMContentLoaded", () => {
  // Bind sidebar navigation URLs
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const key = link.dataset.nav;
    if (NAV_MAP[key]) link.href = NAV_MAP[key];
  });

  // Dynamically update user profile information
  const usuario = JSON.parse(localStorage.getItem('alquimia_usuario') || '{}');
  if (usuario.nombre) {
    const userInitials = initials(usuario.nombre);

    // Update hardcoded username texts
    document.querySelectorAll('aside p, aside div, header p, header h3').forEach((el) => {
      const txt = el.textContent.trim();
      if (txt === 'Gestión Mística' || txt === 'GESTIÓN MÍSTICA') {
        el.textContent = usuario.nombre;
      }
    });

    // Replace static avatar images with initials for a premium personal touch (optional but cool)
    document.querySelectorAll('aside img[alt="Concierge Identity"], header img[alt="User profile avatar portrait"]').forEach((img) => {
      const parent = img.parentElement;
      if (parent) {
        parent.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-gradient-to-tr from-primary to-secondary text-on-primary font-headline font-bold text-sm rounded-full">${userInitials}</div>`;
      }
    });
  }

  // Inject beautiful Logout button at the bottom of the sidebar
  const sidebarFooter = document.querySelector('aside .mt-auto, aside div.mt-auto');
  if (sidebarFooter) {
    const logoutContainer = document.createElement('div');
    logoutContainer.className = 'mt-4 w-full';
    logoutContainer.innerHTML = `
      <button onclick="cerrarSesion()" class="w-full bg-transparent border border-outline-variant/30 text-on-surface-variant hover:text-on-surface hover:bg-error/10 hover:border-error/30 py-3.5 px-6 rounded-full font-bold text-xs tracking-wider transition-all duration-300 flex items-center justify-center gap-2">
        <span class="material-symbols-outlined text-sm">logout</span>
        CERRAR SESIÓN
      </button>
    `;
    sidebarFooter.parentElement.insertBefore(logoutContainer, sidebarFooter);
  }
});

/* Global logout function */
window.cerrarSesion = function() {
  localStorage.removeItem('alquimia_token');
  localStorage.removeItem('alquimia_usuario');
  window.location.href = "login.html";
};

/* Fetch helper for full CRUD, including token attachments */
async function apiFetch(path, options = {}) {
  const url = API + path;
  const defaults = {
    headers: { "Content-Type": "application/json" },
  };

  // Automatically attach Bearer token if session is active
  const token = localStorage.getItem('alquimia_token');
  if (token) {
    defaults.headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge options and stringify body if it's an object
  const finalOptions = { ...defaults, ...options };
  if (finalOptions.body && typeof finalOptions.body === "object") {
    finalOptions.body = JSON.stringify(finalOptions.body);
  }

  const res = await fetch(url, finalOptions);

  // Session expiry interceptor (401)
  if (res.status === 401) {
    localStorage.removeItem('alquimia_token');
    localStorage.removeItem('alquimia_usuario');
    window.location.href = "login.html";
    throw new Error("Su sesión ha expirado. Por favor inicie sesión nuevamente.");
  }

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
