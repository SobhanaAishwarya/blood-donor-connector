/* Requests list — requester sees their own; donor sees nearby + contacted. */
(async function () {
  const { $, $$, icon, escapeHtml, fmt } = BDC;
  const me = await BDC.requireAuth();
  if (!me) return;
  BDC.mountNav("requests");

  const role = me.user.role;
  const list = $("#list");

  if (role === "requester" || role === "admin") {
    $("#pageTitle").textContent = "My requests";
    $("#pageSub").textContent = "Track matching, confirm donations, or raise a new request.";
    $("#newBtn").classList.remove("hide");
    await renderRequesterList();
  } else {
    $("#pageTitle").textContent = "Requests near you";
    $("#pageSub").textContent = "You're only shown requests you're eligible and compatible for.";
    await renderDonorFeed();
  }

  async function renderRequesterList() {
    list.innerHTML = skeletons(2);
    let data;
    try { data = await BDC.api.get("/requests?scope=mine&per_page=50"); }
    catch (err) { list.innerHTML = errBox(err.message); return; }

    if (!data.requests.length) {
      list.className = "";
      list.innerHTML = `<div class="empty">
        <div class="empty__art">${icon("droplets", 44)}</div>
        <h3>No requests yet</h3>
        <p>When someone needs blood, raise a request and we'll contact the nearest eligible donors first.</p>
        <a class="btn btn--primary btn--sm" href="/request.html" style="margin-top:12px">Raise a request</a>
      </div>`;
      return;
    }
    list.className = "grid grid-2";
    list.innerHTML = data.requests.map((r) => {
      const rs = r.ring_state || {};
      const u = BDC.URGENCY[r.urgency] || {};
      const ms = r.match_summary || {};
      return `<a class="card card--interactive req-card" href="/request.html?id=${r.id}">
        <div class="urgency-strip ${u.cls || ""}"></div>
        <div class="req-card__top">
          <div class="req-card__grp">${escapeHtml(r.blood_group)}</div>
          <div class="stack" style="flex:1;gap:6px">
            <div class="spread"><b>${escapeHtml(r.hospital)}</b>${BDC.chips.status(r.status)}</div>
            <div class="req-card__meta">
              <span>${icon("pin", 15)} ${escapeHtml(r.city)}</span>
              <span>${icon("droplets", 15)} ${r.units} unit${r.units > 1 ? "s" : ""}</span>
              <span>${icon("clock", 15)} ${fmt.timeAgo(r.created_at)}</span>
            </div>
          </div>
        </div>
        <div class="spread" style="font-size:var(--fs-sm)">
          <span class="muted">${r.status === "searching" ? `Ring ${rs.current_ring || 1} · ${ms.contacted || 0} contacted` : r.status === "matched" ? "Donor found — confirm when done" : r.status === "fulfilled" ? "Completed" : r.status}</span>
          <span class="link">Open →</span>
        </div>
      </a>`;
    }).join("");
  }

  async function renderDonorFeed() {
    list.className = "stack";
    list.innerHTML = skeletons(2);
    let feed;
    try { feed = await BDC.api.get("/donors/me/requests"); }
    catch (err) { list.innerHTML = errBox(err.message); return; }

    const cards = [];
    feed.contacted.forEach((m) => cards.push(feedCard(m.request, {
      matchId: m.id, response: m.response, distance: m.distance_km, contacted: true,
    })));
    feed.nearby.forEach((r) => cards.push(feedCard(r, { distance: r.distance_km })));

    if (!cards.length) {
      list.innerHTML = `<div class="empty">
        <div class="empty__art">${icon("check-circle", 44)}</div>
        <h3>You're all clear</h3>
        <p>No blood requests currently need your help. We'll notify you the moment one does.</p>
        <a class="btn btn--ghost btn--sm" href="/search.html" style="margin-top:12px">Browse donors instead</a>
      </div>`;
      return;
    }
    list.innerHTML = cards.join("");
    wire();
  }

  function feedCard(r, { matchId, response, distance, contacted } = {}) {
    const u = BDC.URGENCY[r.urgency] || {};
    const canAct = contacted && response === "pending";
    const accepted = response === "accepted";
    return `<article class="card req-card ${canAct ? "" : "card--interactive"}" data-match="${matchId || ""}" data-req="${r.id}">
      <div class="urgency-strip ${u.cls || ""}"></div>
      <div class="req-card__top">
        <div class="req-card__grp">${escapeHtml(r.blood_group)}</div>
        <div class="stack" style="flex:1;gap:6px">
          <div class="spread">
            <b>${escapeHtml(r.hospital)}</b>
            ${contacted ? (accepted ? `<span class="badge badge--ok">${icon("check", 12)} You accepted</span>` : BDC.chips.urgency(r.urgency)) : `<span class="badge">${icon("bell", 12)} Nearby</span>`}
          </div>
          <div class="req-card__meta">
            <span>${icon("pin", 15)} ${escapeHtml(r.city)}${r.location ? " · " + escapeHtml(r.location) : ""}</span>
            <span>${icon("route", 15)} ${fmt.distance(distance)}</span>
            <span>${icon("droplets", 15)} ${r.units} unit${r.units > 1 ? "s" : ""}</span>
          </div>
          ${r.additional_message ? `<p style="font-size:var(--fs-sm)">${escapeHtml(r.additional_message)}</p>` : ""}
        </div>
      </div>
      ${canAct ? `<div class="cluster">
          <button class="btn btn--primary btn--sm" data-act="accept">${icon("heart", 15)} I Can Help</button>
          <button class="btn btn--ghost btn--sm" data-act="decline">Not now</button>
        </div>` : accepted ? `<a class="link" href="/request.html?id=${r.id}">View contact details →</a>` : ""}
    </article>`;
  }

  function wire() {
    $$(".req-card[data-req]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-act]")) return;
        location.href = `/request.html?id=${card.dataset.req}`;
      });
    });
    $$(".req-card [data-act]").forEach((btn) => btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const card = btn.closest(".req-card");
      const matchId = card.dataset.match;
      if (btn.dataset.act === "accept") {
        const ok = await BDC.modal({
          title: "Confirm that you can help?", icon: "heart",
          body: "You're about to respond to an urgent blood request. Your contact details will be shared with the requester after confirmation.",
          confirmText: "Yes, I Can Help", cancelText: "Cancel",
        });
        if (!ok) return;
        BDC.form.busy(btn, true);
        try {
          await BDC.api.post(`/matches/${matchId}/accept`);
          BDC.toast("Response sent. Thank you.", "ok");
          location.href = `/request.html?id=${card.dataset.req}`;
        } catch (err) { BDC.form.busy(btn, false); BDC.toast(err.message, "err"); }
      } else {
        BDC.form.busy(btn, true);
        try {
          await BDC.api.post(`/matches/${matchId}/decline`);
          card.remove();
        } catch (err) { BDC.form.busy(btn, false); BDC.toast(err.message, "err"); }
      }
    }));
  }

  function skeletons(n) {
    return Array.from({ length: n }, () => `<div class="skeleton skeleton--card"></div>`).join("");
  }
  function errBox(msg) {
    return `<div class="empty"><div class="empty__art">${icon("x-circle", 40)}</div><h3>${escapeHtml(msg)}</h3></div>`;
  }
})();
