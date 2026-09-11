/* Reusable UI primitives: toasts, modals, scroll-reveal, counters, forms. */
window.BDC = window.BDC || {};
(function () {
const { $, $$, icon, escapeHtml } = BDC;

/* ---------- Toasts ---------- */
function toastStack() {
  let el = $(".toast-stack");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast-stack";
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

BDC.toast = function (message, kind = "info", timeout = 4200) {
  const ic = { ok: "check-circle", err: "x-circle", info: "info" }[kind] || "info";
  const node = document.createElement("div");
  node.className = `toast toast--${kind}`;
  node.setAttribute("role", "status");
  node.innerHTML = `<span class="toast__icon">${icon(ic, 20)}</span><div class="toast__body">${escapeHtml(message)}</div>`;
  toastStack().appendChild(node);
  const close = () => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), 300);
  };
  node.addEventListener("click", close);
  if (timeout) setTimeout(close, timeout);
  return close;
};

/* ---------- Modal / confirm ---------- */
BDC.modal = function ({ title, body, icon: ic = "alert", confirmText = "Confirm",
                        cancelText = "Cancel", danger = false, hideCancel = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal__icon">${icon(ic, 26)}</div>
        <h3 id="modalTitle">${escapeHtml(title || "")}</h3>
        <div class="modal__text soft" style="margin-top:8px">${body || ""}</div>
        <div class="modal__actions">
          ${hideCancel ? "" : `<button class="btn btn--ghost" data-act="cancel">${escapeHtml(cancelText)}</button>`}
          <button class="btn ${danger ? "btn--danger" : "btn--primary"}" data-act="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    const done = (val) => {
      backdrop.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") done(false);
      if (e.key === "Enter") done(true);
    };
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) done(false);
      const act = e.target.closest("[data-act]");
      if (act) done(act.dataset.act === "ok");
    });
    setTimeout(() => backdrop.querySelector('[data-act="ok"]').focus(), 50);
  });
};

/* ---------- Scroll reveal ---------- */
BDC.initReveal = function (root = document) {
  const items = $$("[data-reveal]", root);
  if (!items.length) return;
  const revealAll = () => items.forEach((i) => i.classList.add("is-visible"));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce || !("IntersectionObserver" in window)) { revealAll(); return; }

  // anything already near the viewport shows immediately (handles deep links)
  const vh = window.innerHeight || 800;
  items.forEach((i) => {
    if (i.getBoundingClientRect().top < vh * 1.2) i.classList.add("is-visible");
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        const delay = e.target.dataset.revealDelay || 0;
        setTimeout(() => e.target.classList.add("is-visible"), +delay);
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  items.forEach((i) => { if (!i.classList.contains("is-visible")) io.observe(i); });

  // safety net: never leave content permanently hidden
  setTimeout(revealAll, 2600);
};

/* ---------- Count up ---------- */
BDC.countUp = function (el, target, { duration = 1400, prefix = "", suffix = "" } = {}) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target = Number(target) || 0;
  if (reduce) { el.textContent = prefix + BDC.fmt.number(target) + suffix; return; }
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + BDC.fmt.number(Math.round(from + (target - from) * eased)) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};

BDC.observeCounters = function (root = document) {
  const els = $$("[data-count]", root);
  if (!els.length) return;
  const fire = (el) => {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    BDC.countUp(el, el.dataset.count, {
      prefix: el.dataset.prefix || "", suffix: el.dataset.suffix || "",
    });
  };
  const vh = window.innerHeight || 800;
  els.forEach((el) => { if (el.getBoundingClientRect().top < vh) fire(el); });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.35 });
    els.forEach((el) => { if (!el.dataset.counted) io.observe(el); });
  }
  // safety: render final values even if nothing scrolled them into view
  setTimeout(() => els.forEach(fire), 2600);
};

/* ---------- Progress ring (SVG) ---------- */
BDC.progressRing = function (percent, { size = 132, stroke = 12, ok = false,
                                        centerTop = "", centerBottom = "" } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, percent));
  const off = c * (1 - p);
  return `
    <div class="progress-ring" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}">
        <circle class="progress-ring__track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" fill="none"/>
        <circle class="progress-ring__bar ${ok ? "is-ok" : ""}" cx="${size / 2}" cy="${size / 2}" r="${r}"
          stroke-width="${stroke}" fill="none"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
      </svg>
      <div class="progress-ring__label"><div><b>${centerTop}</b><span>${centerBottom}</span></div></div>
    </div>`;
};

/* ---------- Form helpers ---------- */
BDC.form = {
  /* read all [name] fields inside a form/section into an object */
  read(scope) {
    const out = {};
    $$("[name]", scope).forEach((el) => {
      if (el.type === "checkbox") out[el.name] = el.checked;
      else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  },
  clearErrors(scope) {
    $$(".field__error", scope).forEach((e) => e.remove());
    $$("[aria-invalid]", scope).forEach((e) => e.removeAttribute("aria-invalid"));
  },
  showErrors(scope, errors) {
    BDC.form.clearErrors(scope);
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const input = $(`[name="${name}"]`, scope);
      if (!input) return;
      input.setAttribute("aria-invalid", "true");
      const err = document.createElement("div");
      err.className = "field__error";
      err.innerHTML = `${icon("alert", 13)}<span>${escapeHtml(msg)}</span>`;
      (input.closest(".field") || input.parentElement).appendChild(err);
      if (!first) first = input;
    });
    if (first) first.focus();
  },
  /* button loading state */
  busy(btn, on, label) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${label ? " " + escapeHtml(label) : ""}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  },
};

/* ---------- Blood group + status chips ---------- */
BDC.chips = {
  blood: (g) => `<span class="badge badge--blood">${escapeHtml(g || "?")}</span>`,
  urgency(u) {
    const map = { critical: "badge--crit", urgent: "badge--warn", normal: "badge--info" };
    const label = (BDC.URGENCY[u] || {}).label || u;
    return `<span class="badge ${map[u] || ""}">${escapeHtml(label)}</span>`;
  },
  status(s) {
    const map = {
      searching: ["badge--warn", "Searching"],
      matched: ["badge--info", "Donor found"],
      fulfilled: ["badge--ok", "Fulfilled"],
      cancelled: ["", "Cancelled"],
      flagged: ["badge--crit", "Flagged"],
    };
    const [cls, label] = map[s] || ["", s];
    return `<span class="badge ${cls}"><span class="dot"></span>${escapeHtml(label)}</span>`;
  },
  eligibility(e) {
    if (!e) return "";
    return e.eligible
      ? `<span class="badge badge--ok">${icon("check", 12)} Eligible</span>`
      : `<span class="badge badge--warn">${icon("clock", 12)} Resting ${e.days_remaining}d</span>`;
  },
};

/* ---------- misc ---------- */
BDC.qs = (k) => new URLSearchParams(location.search).get(k);
BDC.debounce = (fn, ms = 280) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
})();
