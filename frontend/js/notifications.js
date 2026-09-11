/* Notification centre — slide-out panel + unread badge, shared by app pages. */
window.BDC = window.BDC || {};
(function () {
const { $, icon, escapeHtml } = BDC;

BDC.notifications = {
  _panel: null,
  _scrim: null,
  _timer: null,

  init() {
    if (this._panel) return;
    const panel = document.createElement("aside");
    panel.className = "notif-panel";
    panel.setAttribute("aria-label", "Notifications");
    panel.innerHTML = `
      <div class="notif-panel__head">
        <div>
          <strong>Notifications</strong>
          <div class="muted" style="font-size:var(--fs-xs)" id="notifSub">Up to date</div>
        </div>
        <div class="cluster">
          <button class="link" id="notifReadAll" style="font-size:var(--fs-xs)">Mark all read</button>
          <button class="btn--icon" id="notifClose" aria-label="Close notifications">${icon("x", 18)}</button>
        </div>
      </div>
      <div class="notif-list" id="notifList"></div>`;
    const scrim = document.createElement("div");
    scrim.className = "notif-scrim";

    document.body.append(scrim, panel);
    this._panel = panel;
    this._scrim = scrim;

    scrim.addEventListener("click", () => this.close());
    $("#notifClose", panel).addEventListener("click", () => this.close());
    $("#notifReadAll", panel).addEventListener("click", () => this.readAll());

    this.refresh();
    this._timer = setInterval(() => this.refresh(), 20000);
  },

  toggle() {
    this._panel.classList.contains("is-open") ? this.close() : this.open();
  },
  open() {
    this._panel.classList.add("is-open");
    this._scrim.classList.add("is-open");
    this.refresh();
  },
  close() {
    this._panel.classList.remove("is-open");
    this._scrim.classList.remove("is-open");
  },

  async _fetch() {
    const res = await fetch(BDC.API_BASE + "/notifications?per_page=25", {
      headers: { Authorization: `Bearer ${BDC.token.get()}` },
    });
    if (!res.ok) throw new Error("notif fetch failed");
    return res.json();
  },

  async refresh() {
    let json;
    try { json = await this._fetch(); } catch { return; }
    if (!json || json.success === false) return;

    const items = (json.data && json.data.notifications) || [];
    const unread = (json.meta && json.meta.unread_count) || 0;

    const badge = $("#bellCount");
    if (badge) {
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.classList.toggle("hide", unread === 0);
    }
    const sub = $("#notifSub");
    if (sub) sub.textContent = unread ? `${unread} unread` : "Up to date";

    if (!this._panel.classList.contains("is-open")) return;

    const list = $("#notifList");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="empty" style="padding:32px 16px">
        <div class="empty__art">${icon("bell", 40)}</div>
        <h3 style="font-size:var(--fs-md)">Nothing yet</h3>
        <p>Request updates and eligibility changes show up here.</p></div>`;
      return;
    }
    list.innerHTML = items.map((n) => `
      <div class="notif ${n.is_read ? "" : "is-unread"}" data-id="${n.id}"
           data-link="${escapeHtml(n.link || "")}" role="button" tabindex="0">
        <div class="notif__icon type-${escapeHtml(n.type)}">${icon(iconFor(n.type), 18)}</div>
        <div>
          <div class="notif__title">${escapeHtml(n.title)}</div>
          <div class="notif__msg">${escapeHtml(n.message)}</div>
          <div class="notif__time">${BDC.fmt.timeAgo(n.created_at)}</div>
        </div>
      </div>`).join("");

    list.querySelectorAll(".notif").forEach((el) => {
      const act = () => this._openItem(el.dataset.id, el.dataset.link);
      el.addEventListener("click", act);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") act(); });
    });
  },

  async _openItem(id, link) {
    try { await BDC.api.patch(`/notifications/${id}/read`); } catch { /* ignore */ }
    await this.refresh();
    if (link) location.href = link;
  },

  async readAll() {
    try { await BDC.api.post("/notifications/read-all"); } catch { /* ignore */ }
    await this.refresh();
    BDC.toast("All caught up.", "ok", 2200);
  },
};

function iconFor(type) {
  return {
    request: "drop", accept: "check-circle", eligibility: "spark",
    fulfilled: "heart", system: "info",
  }[type] || "info";
}
})();
