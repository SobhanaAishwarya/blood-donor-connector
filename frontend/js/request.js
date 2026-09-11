/* Blood request — create flow + live ring-matching tracker + donor match view. */
(async function () {
  const { $, $$, icon, escapeHtml, fmt } = BDC;

  const me = await BDC.requireAuth();
  if (!me) return;
  BDC.mountNav("request");

  const role = me.user.role;
  const id = BDC.qs("id");
  $("#loading").classList.add("hide");

  let cfg = {};
  try { cfg = await BDC.api.get("/config", { auth: false }); } catch { /* ok */ }

  // tracker state (declared up-front so hoisted functions can use it)
  let state = null;
  let localSecs = 0;
  let secTimer = null;
  let pollTimer = null;

  if (!id) return renderCreate();
  return trackerBoot(id);

  /* ===================== CREATE ===================== */
  function renderCreate() {
    if (role !== "requester" && role !== "admin") {
      $("#createView").classList.remove("hide");
      $("#reqForm").outerHTML = `
        <div class="card card--pad-lg text-center">
          <div class="empty__art" style="margin-inline:auto">${icon("info", 44)}</div>
          <h3>Requests are raised from a requester account</h3>
          <p style="margin:8px 0 var(--sp-4)">You're signed in as a donor. Create a requester account to raise a blood request.</p>
          <a class="btn btn--primary" href="/register.html">Create requester account</a>
        </div>`;
      return;
    }
    $("#createView").classList.remove("hide");

    $("#f-group").innerHTML = `<option value="">Select…</option>` +
      BDC.BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join("");

    const cities = Object.keys((cfg && cfg.city_coords) || {});
    $("#cityList").innerHTML = cities.map((c) => `<option value="${c}">`).join("");

    $("#urgencyPicker").innerHTML = Object.entries(BDC.URGENCY).map(([key, u], i) => `
      <label class="choice" style="padding:14px;flex-direction:column;align-items:flex-start;gap:6px">
        <input type="radio" name="urgency" value="${key}" ${i === 1 ? "checked" : ""} />
        <span class="choice__title">${u.label}</span>
        <span class="choice__desc">${u.note}</span>
      </label>`).join("");
    $("#urgencyPicker").addEventListener("change", () => {
      const v = $('input[name="urgency"]:checked').value;
      $("#critNote").classList.toggle("hide", v !== "critical");
    });

    if (me.user && cfg.city_coords) $("#f-city").value = "";

    $("#reqForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      BDC.form.clearErrors(form);
      const body = BDC.form.read(form);
      body.units = Number(body.units);
      if (!body.required_by) delete body.required_by;
      const btn = $("#reqSubmit");
      BDC.form.busy(btn, true, "Starting…");
      try {
        const data = await BDC.api.post("/requests", body);
        BDC.toast("Matching started — contacting nearby donors.", "ok", 2000);
        setTimeout(() => (location.href = `/request.html?id=${data.request.id}`), 500);
      } catch (err) {
        BDC.form.busy(btn, false);
        if (err.errors) BDC.form.showErrors(form, err.errors);
        BDC.toast(err.message, "err");
      }
    });
  }

  /* ===================== TRACKER ===================== */
  async function trackerBoot(reqId) {
    let data;
    try { data = await BDC.api.get(`/requests/${reqId}`); }
    catch (err) {
      $("#loading").classList.add("hide");
      const host = $("#trackView");
      host.classList.remove("hide");
      $("#trackBody").innerHTML = `<div class="empty"><div class="empty__art">${icon("x-circle", 44)}</div>
        <h3>${escapeHtml(err.message)}</h3><p>You may not have access to this request.</p>
        <a class="btn btn--ghost btn--sm" href="/requests.html" style="margin-top:12px">Back to requests</a></div>`;
      return;
    }

    if (data.privileged) {
      $("#trackView").classList.remove("hide");
      state = data;
      renderTracker();
      startTimers(reqId);
    } else {
      $("#donorMatchView").classList.remove("hide");
      renderDonorMatch(reqId, data);
    }
  }

  function startTimers(reqId) {
    stopTimers();
    localSecs = state.ring_state.time_left_seconds;
    secTimer = setInterval(() => {
      if (["fulfilled", "cancelled"].includes(state.request.status)) return;
      if (state.ring_state.accepted) return;
      localSecs = Math.max(0, localSecs - 1);
      const el = $("#ringClock");
      if (el) el.textContent = fmt.clock(localSecs);
    }, 1000);
    pollTimer = setInterval(() => refetch(reqId), 4000);
  }
  function stopTimers() { clearInterval(secTimer); clearInterval(pollTimer); }

  async function refetch(reqId) {
    try {
      const data = await BDC.api.get(`/requests/${reqId}`);
      state = data;
      renderTracker();
      if (["fulfilled", "cancelled"].includes(data.request.status)) stopTimers();
      else if (Math.abs(localSecs - data.ring_state.time_left_seconds) > 3 || data.ring_state.time_left_seconds === 0)
        localSecs = data.ring_state.time_left_seconds;
    } catch { /* transient */ }
  }

  function renderTracker() {
    const r = state.request;
    const rs = state.ring_state;
    const matches = state.matches || [];
    const u = BDC.URGENCY[r.urgency] || {};
    const accepted = matches.find((m) => m.response === "accepted");

    if (r.status === "fulfilled") return renderFulfilled();
    if (r.status === "cancelled") {
      $("#trackBody").innerHTML = `<div class="empty"><div class="empty__art">${icon("x-circle", 44)}</div>
        <h3>Request cancelled</h3><p>This request is no longer active.</p>
        <a class="btn btn--primary btn--sm" href="/request.html" style="margin-top:12px">Raise a new request</a></div>`;
      return;
    }

    const statusLine = accepted
      ? `${icon("check-circle", 20)} Donor found — awaiting donation`
      : `<span class="spinner"></span> Searching nearby donors`;

    $("#trackBody").innerHTML = `
      <div class="track-hero ${accepted ? "is-done" : u.cls}">
        <div class="track-hero__bar"></div>
        <div class="track-hero__body stack-lg">
          <div class="spread" style="flex-wrap:wrap;gap:var(--sp-4)">
            <div class="stack" style="gap:8px">
              <div class="cluster">
                ${BDC.chips.blood(r.blood_group)}
                ${BDC.chips.urgency(r.urgency)}
                ${BDC.chips.status(r.status)}
              </div>
              <h1 style="font-size:var(--fs-2xl)">${escapeHtml(r.blood_group)} blood needed</h1>
              <div class="req-card__meta">
                <span>${icon("hospital", 15)} ${escapeHtml(r.hospital)}</span>
                <span>${icon("pin", 15)} ${escapeHtml(r.city)}${r.location ? " · " + escapeHtml(r.location) : ""}</span>
                <span>${icon("droplets", 15)} ${r.units} unit${r.units > 1 ? "s" : ""}</span>
              </div>
            </div>
            ${accepted ? "" : `
              <div class="text-center">
                <div class="greeting">Ring ${rs.current_ring} closes in</div>
                <div class="countdown is-crit" id="ringClock">${fmt.clock(localSecs)}</div>
              </div>`}
          </div>

          <div class="track-status">${statusLine}</div>

          <div class="layout-2col">
            <div class="stack">
              <div id="ringMap"></div>
              <div class="cluster" style="justify-content:center">
                <span class="badge"><span class="dot" style="background:var(--amber-500)"></span> Contacted</span>
                <span class="badge"><span class="dot" style="background:var(--ok)"></span> Accepted</span>
                <span class="badge"><span class="dot" style="background:var(--ink-300)"></span> Not reached</span>
              </div>
            </div>
            <div class="rings-list" id="ringsList"></div>
          </div>

          <div class="stack">
            <div class="spread">
              <h2 style="font-size:var(--fs-lg)">${accepted ? "Your matched donor" : `${rs.total_contacted} donor${rs.total_contacted === 1 ? "" : "s"} contacted`}</h2>
              ${accepted ? "" : `<span class="muted" style="font-size:var(--fs-sm)">Waiting for response…</span>`}
            </div>
            <div id="donorList" class="stack"></div>
          </div>

          <div class="cluster" style="border-top:1px solid var(--border);padding-top:var(--sp-5)">
            ${accepted ? "" : `<button class="btn btn--ghost btn--sm" id="simBtn">${icon("clock", 15)} Simulate 15 minutes</button>`}
            <button class="btn btn--ghost btn--sm" id="cancelBtn" style="color:var(--crimson-600)">Cancel request</button>
          </div>
        </div>
      </div>`;

    // ring map
    const vizMax = (rs.rings[2] && rs.rings[2].max_km) || 20;
    const rm = BDC.RingMap.create($("#ringMap"), { rings: rs.rings.slice(0, 3), maxKm: vizMax });
    rm.setActiveRing(rs.current_ring);
    rm.setPassed(rs.rings.filter((x) => x.state === "passed").map((x) => x.ring));
    rm.setNodes(matches.map((m) => ({
      id: m.donor.anon_id,
      label: m.donor.anon_id,
      distanceKm: m.distance_km,
      ring: m.ring,
      bloodGroup: m.donor.blood_group,
      state: m.response === "accepted" ? "accepted"
        : m.response === "pending" ? "contacted"
        : m.response === "declined" ? "declined" : "idle",
    })));

    // ring rows
    $("#ringsList").innerHTML = rs.rings.map((band) => {
      const cls = band.state === "searching" ? "is-searching"
        : band.state === "responded" ? "is-responded"
        : band.state === "passed" ? "is-passed" : "";
      const word = band.state === "searching" ? "Searching…"
        : band.state === "responded" ? "Donor responded"
        : band.state === "passed" ? "Expanded past"
        : band.state === "complete" ? "Complete" : "Not activated yet";
      return `<div class="ring-row ${cls}">
        <div class="ring-row__idx">${band.ring}</div>
        <div class="ring-row__label"><b>Ring ${band.ring} — ${band.label}</b><span>${band.contacted} contacted · ${word}</span></div>
        <div>${band.state === "searching" ? `<span class="spinner"></span>` : band.state === "responded" ? icon("check", 16) : ""}</div>
      </div>`;
    }).join("");

    // donor cards
    $("#donorList").innerHTML = accepted
      ? donorCard(accepted, true)
      : (matches.length
        ? matches.filter((m) => m.response === "pending").map((m) => donorCard(m, false)).join("") ||
          `<p class="muted">All contacted donors have responded. Expanding the search…</p>`
        : emptyDonors());

    wireTrackerActions();
  }

  function donorCard(m, accepted) {
    const d = m.donor;
    return `<div class="donor-anon-card ${accepted ? "is-accepted" : ""}">
      <div class="spread">
        <b class="donor-card__id">Donor #${escapeHtml(d.anon_id)}</b>
        ${BDC.chips.blood(d.blood_group)}
      </div>
      <div class="donor-anon-card__row">${icon("route", 15)} Approximately ${fmt.distance(m.distance_km)} away</div>
      <div class="donor-anon-card__row">${icon("activity", 15)} ${d.available ? "Available" : "Unavailable"} · Ring ${m.ring}</div>
      ${accepted ? `
        <div class="contact-reveal stack" style="gap:6px">
          <b>${icon("check-circle", 15)} This donor accepted your request.</b>
          <div class="donor-anon-card__row">${icon("user", 15)} ${escapeHtml(d.name || "—")}</div>
          <div class="donor-anon-card__row">${icon("phone", 15)} <a href="tel:${escapeHtml(d.phone || "")}">${escapeHtml(d.phone || "—")}</a></div>
          <div class="donor-anon-card__row">${icon("mail", 15)} <a href="mailto:${escapeHtml(d.email || "")}">${escapeHtml(d.email || "—")}</a></div>
        </div>
        <button class="btn btn--primary btn--sm" data-confirm="${m.id}">${icon("check", 15)} Donation completed</button>
      ` : `
        <div class="locked-note">${icon("lock", 14)} Name and contact are hidden until this donor accepts.</div>
      `}
    </div>`;
  }

  function emptyDonors() {
    return `<div class="empty">
      <div class="empty__art">${icon("users", 40)}</div>
      <h3>No eligible donors reached yet</h3>
      <p>The search is expanding outward. You can also widen it now.</p>
    </div>`;
  }

  function wireTrackerActions() {
    const reqId = state.request.id;
    $("#simBtn")?.addEventListener("click", async (e) => {
      BDC.form.busy(e.currentTarget, true);
      try {
        const res = await BDC.api.post(`/requests/${reqId}/simulate-timeout`);
        BDC.toast(res.advanced ? `Expanded to Ring ${res.ring_state.current_ring}.` : "No further rings to expand.", "info", 2600);
        await refetch(reqId);
      } catch (err) { BDC.toast(err.message, "err"); }
      BDC.form.busy(e.currentTarget, false);
    });

    $("#cancelBtn")?.addEventListener("click", async () => {
      const ok = await BDC.modal({
        title: "Cancel this request?", icon: "x-circle", danger: true,
        body: "Contacted donors will be stood down. This can't be undone.",
        confirmText: "Cancel request", cancelText: "Keep searching",
      });
      if (!ok) return;
      try {
        await BDC.api.patch(`/requests/${reqId}`, { action: "cancel" });
        stopTimers();
        await refetch(reqId);
      } catch (err) { BDC.toast(err.message, "err"); }
    });

    $$("[data-confirm]").forEach((btn) => btn.addEventListener("click", async () => {
      const matchId = btn.dataset.confirm;
      const yes = await BDC.modal({
        title: "Did this donor fulfil the request?", icon: "heart",
        body: "Confirming updates the donor's last donation date, recalculates their eligibility and adds a verified donation to their history.",
        confirmText: "Yes, fulfilled", cancelText: "No, not yet",
      });
      try {
        const res = await BDC.api.post(`/requests/${reqId}/confirm`, {
          match_id: Number(matchId), fulfilled: !!yes,
        });
        if (yes) { stopTimers(); state = { ...state, request: res.request }; renderFulfilled(res); }
        else { BDC.toast("Marked as not fulfilled — search resumed.", "info"); await refetch(reqId); }
      } catch (err) { BDC.toast(err.message, "err"); }
    }));
  }

  function renderFulfilled(confirmRes) {
    const r = (confirmRes && confirmRes.request) || state.request;
    $("#trackBody").innerHTML = `
      <div class="track-hero is-done">
        <div class="track-hero__bar"></div>
        <div class="track-hero__body text-center stack-lg">
          <div class="modal__icon" style="margin-inline:auto;background:var(--ok-bg);color:var(--ok)">${icon("check-circle", 28)}</div>
          <div>
            <h1 style="font-size:var(--fs-2xl)">Request fulfilled</h1>
            <p style="max-width:44ch;margin:8px auto 0">Thank you to everyone who helped. The donor's eligibility has been updated automatically.</p>
          </div>
          <div class="card card--flat" style="max-width:420px;margin-inline:auto;text-align:left">
            <div class="spread"><span class="muted">Blood group</span><b>${escapeHtml(r.blood_group)}</b></div>
            <div class="spread"><span class="muted">Hospital</span><b>${escapeHtml(r.hospital)}</b></div>
            <div class="spread"><span class="muted">Units</span><b>${r.units}</b></div>
            ${confirmRes && confirmRes.donor_eligibility ? `<div class="spread"><span class="muted">Donor eligible again</span><b>${fmt.date(confirmRes.donor_eligibility.next_eligible_date)}</b></div>` : ""}
          </div>
          <div class="cluster" style="justify-content:center">
            <a class="btn btn--ghost btn--sm" href="/requests.html">My requests</a>
            <a class="btn btn--primary btn--sm" href="/request.html">Raise another request</a>
          </div>
        </div>
      </div>`;
  }

  /* ===================== DONOR MATCH VIEW ===================== */
  function renderDonorMatch(reqId, data) {
    const m = data.my_match;
    const host = $("#donorMatchBody");
    if (!m) {
      host.innerHTML = `<div class="empty"><div class="empty__art">${icon("info", 44)}</div>
        <h3>This request isn't assigned to you</h3><p>You'll see request details here only for requests you were contacted about.</p></div>`;
      return;
    }
    const r = m.request;
    const accepted = m.response === "accepted";
    host.innerHTML = `
      <div class="card card--pad-lg stack-lg">
        <div class="cluster">${BDC.chips.blood(r.blood_group)} ${BDC.chips.urgency(r.urgency)} <span class="badge">Ring ${m.ring}</span></div>
        <h1 style="font-size:var(--fs-2xl)">${escapeHtml(r.blood_group)} blood needed ${fmt.distance(m.distance_km)} away</h1>
        <div class="req-card__meta">
          <span>${icon("hospital", 15)} ${escapeHtml(r.hospital)}</span>
          <span>${icon("pin", 15)} ${escapeHtml(r.city)}</span>
          <span>${icon("droplets", 15)} ${r.units} unit${r.units > 1 ? "s" : ""}</span>
        </div>
        ${r.additional_message ? `<p>${escapeHtml(r.additional_message)}</p>` : ""}
        ${accepted ? `
          <div class="contact-reveal stack" style="gap:6px">
            <b>${icon("check-circle", 16)} You accepted this request.</b>
            <div class="donor-anon-card__row">${icon("user", 15)} ${escapeHtml(r.requester_name || "Requester")}</div>
            <div class="donor-anon-card__row">${icon("phone", 15)} <a href="tel:${escapeHtml(r.requester_phone || "")}">${escapeHtml(r.requester_phone || "—")}</a></div>
            <div class="donor-anon-card__row">${icon("mail", 15)} <a href="mailto:${escapeHtml(r.requester_email || "")}">${escapeHtml(r.requester_email || "—")}</a></div>
          </div>` : `
          <div class="locked-note">${icon("lock", 14)} The requester's contact details appear here after you accept.</div>
          <div class="cluster">
            <button class="btn btn--primary" id="dmAccept">${icon("heart", 16)} I Can Help</button>
            <button class="btn btn--ghost" id="dmDecline">Not now</button>
          </div>`}
      </div>`;

    $("#dmAccept")?.addEventListener("click", async () => {
      const ok = await BDC.modal({
        title: "Confirm that you can help?", icon: "heart",
        body: "You're about to respond to an urgent blood request. Your contact details will be shared with the requester after confirmation.",
        confirmText: "Yes, I Can Help", cancelText: "Cancel",
      });
      if (!ok) return;
      try {
        await BDC.api.post(`/matches/${m.id}/accept`);
        BDC.toast("Response sent. Thank you.", "ok");
        trackerBoot(reqId);
      } catch (err) { BDC.toast(err.message, "err"); }
    });
    $("#dmDecline")?.addEventListener("click", async () => {
      try {
        await BDC.api.post(`/matches/${m.id}/decline`);
        BDC.toast("Noted — you won't be contacted for this request.", "info");
        location.href = "/dashboard.html";
      } catch (err) { BDC.toast(err.message, "err"); }
    });
  }
})();
