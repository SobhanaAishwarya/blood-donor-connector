/* Inline stroke-icon set (Feather-style, 24x24). Usage: BDC.icon("heart", 18) */
window.BDC = window.BDC || {};

BDC._icons = {
  drop: '<path d="M12 2.5S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12.5-7-12.5Z"/>',
  heart: '<path d="M20.8 6.6a5 5 0 0 0-8-1.3L12 6l-.8-.7a5 5 0 1 0-7 7L12 21l7.8-8a5 5 0 0 0 1-6.4Z"/>',
  "heart-hand": '<path d="M11 14 7.7 10.7a2.4 2.4 0 0 1 3.3-3.4l0 0 .0 0a2.4 2.4 0 0 1 3.4 3.4Z"/><path d="M3 12v6a2 2 0 0 0 2 2h9l4-2 3-6a2 2 0 0 0-2.6-2.6L16 11"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 5 6v6c0 5 3.4 7.6 7 9 3.6-1.4 7-4 7-9V6Z"/>',
  "shield-check": '<path d="M12 3 5 6v6c0 5 3.4 7.6 7 9 3.6-1.4 7-4 7-9V6Z"/><path d="m9.2 12 2 2 3.6-4"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6 2 7H4c.5-1 2-2 2-7Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M5.5 20a7 7 0 0 1 13 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3.5 19a6 6 0 0 1 11 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.9"/><path d="M17 19a6 6 0 0 0-3-5.2"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  "x-circle": '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  "arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  chart: '<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  logout: '<path d="M9 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/><path d="m15 8 4 4-4 4M19 12H9"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 9v5M12 17.5v.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8 16.5 15.5 8"/><path d="M6 15V9a3 3 0 0 1 3-3h3"/>',
  phone: '<path d="M6.5 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  hospital: '<path d="M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15"/><path d="M2 21h20M12 7v6M9 10h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  droplets: '<path d="M8 4s-3 3.6-3 6a3 3 0 0 0 6 0c0-2.4-3-6-3-6Z"/><path d="M15 10s-3 3.6-3 6a3 3 0 0 0 6 0c0-2.4-3-6-3-6Z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>',
  "trend-up": '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 8v4l3 2"/>',
};

BDC.icon = function (name, size = 20, extraClass = "") {
  const body = BDC._icons[name] || BDC._icons.info;
  return `<svg class="ic ic-${name} ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
};
