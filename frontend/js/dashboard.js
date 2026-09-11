/* Donor dashboard. */
(async function () {
  const { $, $$, icon, escapeHtml, fmt } = BDC;

  const me = await BDC.requireAuth(["donor"]);
  if (!me) return;
  BDC.mountNav("dashboard");

  const first = me.user.name.split(" ")[0];
  const h = new Date().getHours();
  $("#greeting").textContent =
    `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"},`;
  $("#donorName").textContent = first;

  let donor = me.donor;
  let elig = me.eligibility;

  // ---- profile completeness gate ----
  if (!donor || !donor.profile_complete) {
    $("#dashBody").classList.add("hide");
    const gate = $("#profileGate");
    gate.classList.remove("hide");
    gate.innerHTML = `
      <div class="card card--pad-lg" style="text-align:center">
        <div class="empty__art" style="margin-inline:auto">${icon("user", 44)}</div>
        <h2>Finish your donor profile</h2>
        <p style="max-width:44ch;margin:8px auto var(--sp-5)">
          Add your blood group, sex and city so we can match you to nearby requests
          and calculate your eligibility.</p>
        <form id="completeForm" class="stack" style="max-width:420px;margin-inline:auto;text-align:left">
          <div class="field">
            <label>Blood group</label>
            <div class="pill-row" id="cg"></div>
            <input type="hidden" name="blood_group" value="${donor?.blood_group || ""}" />
          </div>
          <div class="field">
            <label for="cf-gender">Sex</label>
            <select class="select" id="cf-gender" name="gender">
              <option value="">Select…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <span class="hint">Men rest 90 days between donations; women 120.</span>
          </div>
          <div class="grid grid-2" style="gap:var(--sp-3)">
            <div class="field"><label for="cf-city">City</label><input class="input" id="cf-city" name="city" placeholder="Visakhapatnam" value="${donor?.city || ""}" /></div>
            <div class="field"><label for="cf-loc">Locality</label><input class="input" id="cf-loc" name="locality" placeholder="MVP Colony" value="${donor?.locality || ""}" /></div>
          </div>
          <div class="field">
            <label for="cf-last">Last donation date (optional)</label>
            <input class="input" id="cf-last" name="last_donation_date" type="date" value="${donor?.last_donation_date || ""}" />
          </div>
          <button class="btn btn--primary btn--block" type="submit" id="cf-submit">Save profile</button>
        </form>
      </div>`;
    $("#cg").innerHTML = BDC.BLOOD_GROUPS.map((g) =>
      `<button type="button" class="badge badge--lg ${donor?.blood_group === g ? "badge--blood" : ""}" data-g="${g}" style="cursor:pointer">${g}</button>`).join("");
    $("#cg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]"); if (!b) return;
      $$("#cg [data-g]").forEach((x) => x.classList.remove("badge--blood"));
      b.classList.add("badge--blood");
      $('#completeForm [name="blood_group"]').value = b.dataset.g;
    });
    if (donor?.gender) $("#cf-gender").value = donor.gender;
    $("#completeForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = BDC.form.read(e.currentTarget);
      const btn = $("#cf-submit");
      BDC.form.busy(btn, true, "Saving…");
      try {
        const res = await BDC.api.put("/donors/me", body);
        BDC.toast("Profile saved.", "ok");
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        BDC.form.busy(btn, false);
        if (err.errors) BDC.form.showErrors(e.currentTarget, err.errors);
        BDC.toast(err.message, "err");
      }
    });
    return;
  }

  // ---- availability toggle ----
  const availToggle = $("#availToggle");
  availToggle.checked = donor.available;
  paintStatus();
  availToggle.addEventListener("change", async () => {
    try {
      const r = await BDC.api.patch("/donors/me/availability", { available: availToggle.checked });
      donor.available = r.available;
      paintStatus();
      BDC.toast(r.available ? "You're now available to help." : "Availability paused.", "ok", 2200);
    } catch (err) {
      availToggle.checked = !availToggle.checked;
      BDC.toast(err.message, "err");
    }
  });
  function paintStatus() {
    const on = availToggle.checked;
    $("#statusCard").classList.toggle("is-off", !on);
    $("#statusText").textContent = on ? "You are available" : "You are not available";
    $("#availLabel").textContent = on ? "Available" : "Unavailable";
  }

  // ---- stat tiles ----
  const stats = await BDC.api.get("/donors/me/stats");
  $("#statTiles").innerHTML = [
    ["shield-check", elig.eligible ? "Eligible" : `Rest ${elig.days_remaining}d`, "Eligibility", elig.eligible ? "var(--ok)" : "var(--warn)"],
    ["heart", stats.donations_completed, "Donations completed"],
    ["users", stats.requests_helped, "Requests helped"],
    ["activity", donor.available ? "On" : "Off", "Availability", donor.available ? "var(--ok)" : "var(--text-mute)"],
  ].map(([ic, val, label, color]) => `
    <div class="stat-tile">
      <div class="stat-tile__icon" ${color ? `style="color:${color}"` : ""}>${icon(ic, 18)}</div>
      <div class="stat-tile__value">${escapeHtml(String(val))}</div>
      <div class="stat-tile__label">${label}</div>
    </div>`).join("");

  // ---- eligibility card ----
  renderElig();
  function renderElig() {
    const pct = elig.progress ?? (elig.days_since && elig.interval_days ? Math.min(1, elig.days_since / elig.interval_days) : 1);
    const top = elig.days_since != null ? elig.days_since : " - ";
    const bottom = `/ ${elig.interval_days} days`;
    $("#eligBody").innerHTML = `
      ${BDC.progressRing(pct, {
        ok: elig.eligible,
        centerTop: top,
        centerBottom: bottom,
      })}
      <div class="elig-card__body stack">
        <div class="elig-headline">
          <span class="glyph">${elig.eligible ? "🟢" : "🔴"}</span>
          ${escapeHtml(elig.headline)}
        </div>
        <p style="color:var(--text)">${escapeHtml(elig.message)}</p>
        <div class="cluster">
          ${BDC.chips.eligibility(elig)}
          <span class="badge">${icon("calendar", 12)} ${elig.eligible ? "Ready to donate now" : "Eligible " + fmt.date(elig.next_eligible_date)}</span>
        </div>
        <p class="muted" style="font-size:var(--fs-xs)">Eligibility is calculated automatically and can't be overridden.</p>
      </div>`;
  }

  // ---- profile mini ----
  $("#profileMini").innerHTML = [
    ["droplets", "Blood group", donor.blood_group],
    ["pin", "Location", `${donor.locality ? donor.locality + ", " : ""}${donor.city}`],
    ["shield", "Anon ID", donor.anon_id],
    ["history", "Verified donations", donor.verified_donation_count],
    ["calendar", "Member since", memberSince(me.user.created_at)],
  ].map(([ic, k, v]) => `
    <div class="spread" style="border-bottom:1px solid var(--border);padding-bottom:8px">
      <span class="donor-card__row">${icon(ic, 15)} ${k}</span><b>${escapeHtml(String(v ?? " - "))}</b>
    </div>`).join("");
  $("#editProfileBtn").addEventListener("click", openEditModal);

  // ---- donation history ----
  const { donations } = await BDC.api.get("/donors/me/donations");
  if (!donations.length) {
    $("#historyWrap").innerHTML = emptyState("history", "No donations yet",
      "When a requester confirms your help, it appears here as a verified donation.");
  } else {
    $("#historyWrap").innerHTML = `<div class="timeline">${donations.map((d, i) => `
      <div class="timeline__item ${i > 0 ? "is-muted" : ""}">
        <span class="timeline__dot"></span>
        <div class="timeline__date">${fmt.date(d.donation_date)}</div>
        <div class="timeline__title">${escapeHtml(d.blood_group || donor.blood_group)} donation${d.city ? " · " + escapeHtml(d.city) : ""}</div>
        <div class="muted" style="font-size:var(--fs-sm)">${d.hospital ? escapeHtml(d.hospital) : "Community blood drive"}${d.verified ? " · ✓ verified" : ""}</div>
      </div>`).join("")}</div>`;
  }

  // ---- nearby / contacted requests ----
  await loadRequests();
  async function loadRequests() {
    const wrap = $("#requestsWrap");
    wrap.innerHTML = `<div class="skeleton skeleton--card"></div>`;
    let feed;
    try { feed = await BDC.api.get("/donors/me/requests"); }
    catch { wrap.innerHTML = emptyState("alert", "Couldn't load requests", "Try again shortly."); return; }

    const cards = [];
    feed.contacted.forEach((m) => cards.push(reqCard(m.request, {
      matchId: m.id, response: m.response, distance: m.distance_km, contacted: true,
    })));
    feed.nearby.forEach((r) => cards.push(reqCard(r, { distance: r.distance_km })));

    if (!cards.length) {
      wrap.innerHTML = emptyState("check-circle", "You're all clear",
        "No blood requests currently need your help. We'll notify you the moment one does.");
      return;
    }
    wrap.innerHTML = cards.join("");
    wireReqCards(wrap);
  }

  function reqCard(r, { matchId, response, distance, contacted } = {}) {
    const u = BDC.URGENCY[r.urgency] || {};
    const canAct = contacted && response === "pending";
    const accepted = response === "accepted";
    return `
      <article class="card card--interactive req-card" data-match="${matchId || ""}" data-req="${r.id}">
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
              ${contacted ? `<span>${icon("target", 15)} Ring ${r.current_ring}</span>` : ""}
            </div>
            ${r.additional_message ? `<p style="font-size:var(--fs-sm)">${escapeHtml(r.additional_message)}</p>` : ""}
          </div>
        </div>
        ${canAct ? `
          <div class="cluster">
            <button class="btn btn--primary btn--sm" data-act="accept">${icon("heart", 15)} I Can Help</button>
            <button class="btn btn--ghost btn--sm" data-act="decline">Not now</button>
          </div>` : accepted ? `
          <div class="contact-reveal">
            ${icon("check-circle", 16)} <b>Your response is sent.</b> The requester now has your contact details.
            <a class="link" href="/request.html?id=${r.id}" style="display:inline-block;margin-top:6px">Track this request →</a>
          </div>` : ""}
      </article>`;
  }

  function wireReqCards(wrap) {
    $$(".req-card [data-act]", wrap).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const card = btn.closest(".req-card");
        const matchId = card.dataset.match;
        if (btn.dataset.act === "accept") {
          const ok = await BDC.modal({
            title: "Confirm that you can help?",
            icon: "heart",
            body: "You're about to respond to an urgent blood request. Your contact details will be shared with the requester after confirmation.",
            confirmText: "Yes, I Can Help",
            cancelText: "Cancel",
          });
          if (!ok) return;
          BDC.form.busy(btn, true);
          try {
            await BDC.api.post(`/matches/${matchId}/accept`);
            await successState(card);
          } catch (err) { BDC.form.busy(btn, false); BDC.toast(err.message, "err"); }
        } else {
          BDC.form.busy(btn, true);
          try {
            await BDC.api.post(`/matches/${matchId}/decline`);
            card.style.opacity = 0.5;
            card.innerHTML = `<div class="muted" style="padding:8px">You passed on this request. Thanks for letting us know.</div>`;
            loadDonorRefresh();
          } catch (err) { BDC.form.busy(btn, false); BDC.toast(err.message, "err"); }
        }
      });
    });
    $$(".req-card", wrap).forEach((card) => {
      card.addEventListener("click", () => {
        if (card.dataset.req) location.href = `/request.html?id=${card.dataset.req}`;
      });
    });
  }

  async function successState(card) {
    card.classList.add("card--flat");
    card.innerHTML = `
      <div style="text-align:center;padding:var(--sp-4)">
        <div class="modal__icon" style="margin-inline:auto">${icon("heart", 26)}</div>
        <h3>You could make a difference today.</h3>
        <p style="margin:6px 0 var(--sp-3)">Your response has been sent. The requester can now see your contact details.</p>
        <a class="btn btn--primary btn--sm" href="/request.html?id=${card.dataset.req}">See next steps</a>
      </div>`;
    BDC.toast("Response sent. Thank you.", "ok");
    loadDonorRefresh();
  }

  async function loadDonorRefresh() {
    try {
      const s = await BDC.api.get("/donors/me/stats");
      BDC.notifications.refresh();
    } catch { /* ignore */ }
  }

  // ---- edit profile modal ----
  async function openEditModal() {
    const d = donor;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="width:min(520px,100%)">
        <h3>Edit profile</h3>
        <form id="editForm" class="stack" style="margin-top:var(--sp-4)">
          <div class="grid grid-2" style="gap:var(--sp-3)">
            <div class="field"><label>Blood group</label>
              <select class="select" name="blood_group">${BDC.BLOOD_GROUPS.map((g) => `<option ${g === d.blood_group ? "selected" : ""}>${g}</option>`).join("")}</select></div>
            <div class="field"><label>Sex</label>
              <select class="select" name="gender">
                ${["female", "male", "other"].map((x) => `<option value="${x}" ${x === d.gender ? "selected" : ""}>${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}
              </select></div>
          </div>
          <div class="grid grid-2" style="gap:var(--sp-3)">
            <div class="field"><label>City</label><input class="input" name="city" value="${escapeHtml(d.city || "")}" /></div>
            <div class="field"><label>Locality</label><input class="input" name="locality" value="${escapeHtml(d.locality || "")}" /></div>
          </div>
          <div class="field"><label>Last donation date</label>
            <input class="input" type="date" name="last_donation_date" value="${d.last_donation_date || ""}" />
            <span class="hint">Changing this recalculates your eligibility immediately.</span>
          </div>
          <div class="modal__actions">
            <button type="button" class="btn btn--ghost" data-close>Cancel</button>
            <button type="submit" class="btn btn--primary" id="editSave">Save changes</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";
    const close = () => { backdrop.remove(); document.body.style.overflow = ""; };
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop || e.target.hasAttribute("data-close")) close();
    });
    $("#editForm", backdrop).addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = BDC.form.read(e.currentTarget);
      const btn = $("#editSave", backdrop);
      BDC.form.busy(btn, true, "Saving…");
      try {
        const res = await BDC.api.put("/donors/me", body);
        donor = res.donor; elig = res.eligibility;
        close();
        BDC.toast("Profile updated.", "ok");
        renderElig();
        $("#profileMini").closest(".card"); // refresh mini
        location.reload();
      } catch (err) {
        BDC.form.busy(btn, false);
        if (err.errors) BDC.form.showErrors(e.currentTarget, err.errors);
        BDC.toast(err.message, "err");
      }
    });
  }

  function memberSince(iso) {
    if (!iso) return " - ";
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    const tenure = days >= 365 ? `${(days / 365).toFixed(1)} yrs`
      : days >= 30 ? `${Math.floor(days / 30)} mo`
      : `${Math.max(days, 0)} d`;
    return `${fmt.date(iso)} · ${tenure}`;
  }

  function emptyState(ic, title, text) {
    return `<div class="empty">
      <div class="empty__art">${icon(ic, 44)}</div>
      <h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
  }
})();
