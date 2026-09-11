/* Session state, route guards, and the shared top navigation. */
window.BDC = window.BDC || {};
(function () {
const { $, icon, escapeHtml } = BDC;

BDC.session = {
  _me: null,
  async load(force = false) {
    if (this._me && !force) return this._me;
    if (!BDC.token.get()) return null;
    try {
      this._me = await BDC.api.get("/auth/me");
      return this._me;
    } catch {
      this._me = null;
      return null;
    }
  },
  get() { return this._me; },
  set(data) { this._me = data; },
  clear() { this._me = null; BDC.token.clear(); },
  async logout() {
    try { await BDC.api.post("/auth/logout"); } catch { /* ignore */ }
    this.clear();
    location.href = "/index.html";
  },
};

/* Guards -------------------------------------------------------------- */
BDC.requireAuth = async function (roles = null) {
  const me = await BDC.session.load();
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/login.html?next=${next}`;
    return null;
  }
  if (roles && !roles.includes(me.user.role)) {
    BDC.toast("That area isn't available for your role.", "err");
    setTimeout(() => (location.href = BDC.homeFor(me.user.role)), 900);
    return null;
  }
  return me;
};

BDC.homeFor = function (role) {
  return role === "admin" ? "/admin.html"
    : role === "donor" ? "/dashboard.html"
    : "/requests.html";
};

/* Shared navigation ------------------------------------------------- */
BDC.mountNav = function (active = "") {
  const host = $("#nav");
  if (!host) return;
  const me = BDC.session.get();
  const role = me && me.user.role;

  const guestLinks = `
    <a class="nav__link" href="/index.html#how">How it works</a>
    <a class="nav__link" href="/search.html">Find a donor</a>
    <a class="nav__link" href="/login.html">Sign in</a>
    <a class="btn btn--primary btn--sm" href="/register.html">${icon("drop", 16)} Become a donor</a>`;

  const linksByRole = {
    donor: [
      ["/dashboard.html", "Dashboard"],
      ["/requests.html", "Requests near me"],
      ["/search.html", "Find a donor"],
    ],
    requester: [
      ["/request.html", "New request"],
      ["/requests.html", "My requests"],
      ["/search.html", "Find a donor"],
    ],
    admin: [
      ["/admin.html", "Overview"],
      ["/search.html", "Donors"],
    ],
  };

  let authLinks = "";
  if (role) {
    authLinks = (linksByRole[role] || []).map(([href, label]) => {
      const is = active && href.includes(active) ? "is-active" : "";
      return `<a class="nav__link ${is}" href="${href}">${escapeHtml(label)}</a>`;
    }).join("");
  }

  host.innerHTML = `
    <div class="container nav__inner">
      <a class="brand" href="/index.html">
        <span class="brand__mark">${icon("drop", 19)}</span>
        <span>Blood Donor Connector</span>
      </a>
      <button class="nav__toggle" aria-label="Menu" aria-expanded="false">${icon("menu", 20)}</button>
      <nav class="nav__links">
        ${role ? authLinks : guestLinks}
        ${role ? `
          <button class="btn--icon bell" id="bellBtn" aria-label="Notifications">
            ${icon("bell", 20)}
            <span class="bell__count hide" id="bellCount">0</span>
          </button>
          <div style="position:relative">
            <button class="avatar" id="avatarBtn" aria-haspopup="true" aria-expanded="false">${initials(me.user.name)}</button>
            <div class="menu" id="userMenu" role="menu">
              <div style="padding:10px 12px">
                <b style="display:block">${escapeHtml(me.user.name)}</b>
                <small class="muted">${escapeHtml(me.user.email)}</small>
              </div>
              <div class="menu__sep"></div>
              <button class="menu__item" data-go="${BDC.homeFor(role)}">${icon("activity", 16)} My ${role === "requester" ? "requests" : "dashboard"}</button>
              <button class="menu__item" id="themeToggle">${icon("sun", 16)} Theme: <span id="themeName">${BDC.theme.get()}</span></button>
              <div class="menu__sep"></div>
              <button class="menu__item" id="logoutBtn">${icon("logout", 16)} Sign out</button>
            </div>
          </div>` : `
          <button class="btn--icon" id="themeToggleGuest" aria-label="Toggle theme">${icon("moon", 18)}</button>`}
      </nav>
    </div>`;

  wireNav(host);
  if (role) BDC.notifications.init();
};

function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

function wireNav(host) {
  const toggle = $(".nav__toggle", host);
  const links = $(".nav__links", host);
  toggle && toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  const avatarBtn = $("#avatarBtn", host);
  const menu = $("#userMenu", host);
  if (avatarBtn) {
    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("is-open");
      avatarBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", () => menu.classList.remove("is-open"));
    menu.addEventListener("click", (e) => e.stopPropagation());
    $("#logoutBtn", host)?.addEventListener("click", () => BDC.session.logout());
    menu.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => (location.href = b.dataset.go)));
    $("#themeToggle", host)?.addEventListener("click", (e) => {
      e.stopPropagation();
      const next = BDC.theme.toggle();
      $("#themeName", host).textContent = next;
    });
  }
  $("#themeToggleGuest", host)?.addEventListener("click", () => BDC.theme.toggle());

  $("#bellBtn", host)?.addEventListener("click", () => BDC.notifications.toggle());
}
})();
