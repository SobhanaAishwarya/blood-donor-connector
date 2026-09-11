/* Global front-end configuration + tiny helpers shared everywhere. */
window.BDC = window.BDC || {};

BDC.API_BASE = "/api";
BDC.TOKEN_KEY = "bdc_token";
BDC.THEME_KEY = "bdc_theme";

BDC.BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
BDC.URGENCY = {
  critical: { label: "Critical", note: "Needed immediately", cls: "is-critical" },
  urgent: { label: "Urgent", note: "Needed within a few hours", cls: "is-urgent" },
  normal: { label: "Normal", note: "Needed soon", cls: "is-normal" },
};

/* $ / $$ */
BDC.$ = (sel, root = document) => root.querySelector(sel);
BDC.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

BDC.escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

BDC.fmt = {
  distance(km) {
    if (km == null || !isFinite(km)) return "—";
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  },
  timeAgo(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 90) return "a minute ago";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 7200) return "an hour ago";
    if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
    if (s < 172800) return "yesterday";
    if (s < 604800) return `${Math.floor(s / 86400)} days ago`;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  },
  date(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });
  },
  clock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  },
  number(n) {
    return new Intl.NumberFormat().format(n ?? 0);
  },
};

/* Theme (respects system, allows explicit override) */
BDC.theme = {
  apply(mode) {
    if (mode === "light" || mode === "dark") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  },
  get() {
    try { return localStorage.getItem(BDC.THEME_KEY) || "system"; }
    catch { return "system"; }
  },
  set(mode) {
    try {
      if (mode === "system") localStorage.removeItem(BDC.THEME_KEY);
      else localStorage.setItem(BDC.THEME_KEY, mode);
    } catch { /* ignore */ }
    BDC.theme.apply(mode);
  },
  toggle() {
    const order = ["system", "light", "dark"];
    const next = order[(order.indexOf(BDC.theme.get()) + 1) % order.length];
    BDC.theme.set(next);
    return next;
  },
  init() { BDC.theme.apply(BDC.theme.get()); },
};
BDC.theme.init();
