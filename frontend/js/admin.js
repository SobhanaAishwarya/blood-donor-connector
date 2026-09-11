/* Admin overview: metrics, charts, moderation tables. */
(async function () {
  const { $, $$, icon, escapeHtml, fmt } = BDC;
  const me = await BDC.requireAuth(["admin"]);
  if (!me) return;
  BDC.mountNav("admin");

  const PALETTE = ["#c2132c", "#e08a00", "#2563eb", "#12a150", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

  let dash;
  try { dash = await BDC.api.get("/admin/dashboard"); }
  catch (err) { document.querySelector(".stack-lg").innerHTML = `<div class="empty"><h3>${escapeHtml(err.message)}</h3></div>`; return; }

  // ---- metrics ----
  const t = dash.totals;
  $("#metrics").innerHTML = [
    ["users", t.donors, "Total donors", "trend-up", `${t.eligible_donors} eligible now`],
    ["shield-check", t.eligible_donors, "Eligible donors", null, `${t.donors - t.eligible_donors} resting`],
    ["activity", t.unavailable_donors, "Unavailable donors", null, `${t.available_donors} available`],
    ["droplets", t.active_requests, "Active requests", null, `${t.pending_requests} searching`],
    ["check-circle", t.fulfilled_requests, "Fulfilled requests", "trend-up", `${t.donations} donations logged`],
    ["flag", t.flagged_requests, "Flagged requests", null, "needs review"],
  ].map(([ic, val, label, trend, sub]) => `
    <div class="metric">
      <div class="spread"><div class="stat-tile__icon">${icon(ic, 18)}</div>${trend ? `<span class="metric__trend">${icon(trend, 13)}</span>` : ""}</div>
      <div class="metric__value" data-count="${val}">0</div>
      <div class="metric__label">${label}</div>
      <div class="muted" style="font-size:var(--fs-xs);margin-top:4px">${escapeHtml(sub)}</div>
    </div>`).join("");
  BDC.observeCounters();

  // ---- charts ----
  const c = dash.charts;
  $("#charts").innerHTML = [
    chartCard("Requests by blood group", barChart(c.requests_by_group)),
    chartCard("Requests by city", barChart(c.requests_by_city)),
    chartCard("Fulfilled vs pending", donutPair(c.requests_by_status, ["fulfilled", "searching"])),
    chartCard("Donor availability", donutChart(c.donor_availability)),
  ].join("");

  function chartCard(title, inner) {
    return `<div class="card"><div class="card__title" style="margin-bottom:var(--sp-4)">${title}</div>${inner}</div>`;
  }

  function barChart(series) {
    if (!series || !series.length) return emptyMini();
    const max = Math.max(...series.map((s) => s.value), 1);
    return `<div class="bars">${series.map((s, i) => `
      <div class="bar-row">
        <span class="nowrap">${escapeHtml(s.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(s.value / max) * 100}%;background:${PALETTE[i % PALETTE.length]}"></span></span>
        <b>${s.value}</b>
      </div>`).join("")}</div>`;
  }

  function donutChart(series) {
    if (!series || !series.length) return emptyMini();
    const total = series.reduce((a, s) => a + s.value, 0) || 1;
    let acc = 0;
    const R = 60, C = 2 * Math.PI * R;
    const segs = series.map((s, i) => {
      const frac = s.value / total;
      const seg = `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${PALETTE[i % PALETTE.length]}"
        stroke-width="22" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}"
        stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 75 75)"/>`;
      acc += frac;
      return seg;
    }).join("");
    return `<div class="cluster" style="gap:var(--sp-6)">
      <svg class="donut" viewBox="0 0 150 150">${segs}<circle r="42" cx="75" cy="75" fill="var(--surface)"/></svg>
      <div class="stack" style="gap:8px">${series.map((s, i) => `
        <div class="donor-card__row"><span class="dot" style="width:10px;height:10px;border-radius:3px;background:${PALETTE[i % PALETTE.length]}"></span>
        ${escapeHtml(s.label)} · <b>${s.value}</b></div>`).join("")}</div>
    </div>`;
  }

  function donutPair(statusSeries, keys) {
    const map = Object.fromEntries((statusSeries || []).map((s) => [s.label, s.value]));
    return donutChart(keys.map((k) => ({ label: k === "searching" ? "pending" : k, value: map[k] || 0 })));
  }

  function emptyMini() {
    return `<p class="muted" style="padding:20px 0">No data yet.</p>`;
  }

  // ---- activity table ----
  const act = dash.matching_activity || [];
  $("#activityTable").innerHTML = `
    <thead><tr><th>Request</th><th>Donor</th><th>Ring</th><th>Distance</th><th>Response</th><th>When</th></tr></thead>
    <tbody>${act.length ? act.map((a) => `
      <tr>
        <td>#${a.request_id}</td>
        <td>${escapeHtml(a.donor_anon)}</td>
        <td>${a.ring}</td>
        <td>${fmt.distance(a.distance_km)}</td>
        <td>${responseBadge(a.response)}</td>
        <td class="muted">${fmt.timeAgo(a.contacted_at)}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="muted">No matching activity yet.</td></tr>`}</tbody>`;

  function responseBadge(r) {
    const map = { pending: "badge--warn", accepted: "badge--ok", declined: "", expired: "" };
    return `<span class="badge ${map[r] || ""}">${escapeHtml(r)}</span>`;
  }

  // ---- requests table ----
  const rq = await BDC.api.get("/admin/requests?per_page=40");
  $("#reqCount").textContent = `${rq.requests.length} shown`;
  $("#requestsTable").innerHTML = `
    <thead><tr><th>ID</th><th>Group</th><th>Urgency</th><th>City</th><th>Status</th><th>Contacted</th><th>Requester</th><th></th></tr></thead>
    <tbody>${rq.requests.map((r) => `
      <tr data-id="${r.id}">
        <td>#${r.id}</td>
        <td>${BDC.chips.blood(r.blood_group)}</td>
        <td>${escapeHtml((BDC.URGENCY[r.urgency] || {}).label || r.urgency)}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${BDC.chips.status(r.status)}</td>
        <td>${(r.match_summary || {}).contacted || 0} · ${(r.match_summary || {}).accepted || 0} accepted</td>
        <td class="muted">${escapeHtml(r.requester_name || " - ")}</td>
        <td><button class="link" data-flag="${r.id}">${r.status === "flagged" ? "Unflag" : "Flag"}</button></td>
      </tr>`).join("")}</tbody>`;
  $$("#requestsTable [data-flag]").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.dataset.flag;
    const flag = btn.textContent === "Flag";
    try {
      await BDC.api.patch(`/admin/requests/${id}/flag`, { flagged: flag });
      BDC.toast(flag ? "Request flagged for review." : "Flag removed.", "ok", 2200);
      const row = btn.closest("tr");
      row.querySelector("td:nth-child(5)").innerHTML = BDC.chips.status(flag ? "flagged" : "searching");
      btn.textContent = flag ? "Unflag" : "Flag";
    } catch (err) { BDC.toast(err.message, "err"); }
  }));

  // ---- donors table ----
  const dn = await BDC.api.get("/admin/donors?per_page=40");
  $("#donorsTable").innerHTML = `
    <thead><tr><th>Anon</th><th>Name</th><th>Group</th><th>City</th><th>Eligibility</th><th>Available</th><th>Donations</th></tr></thead>
    <tbody>${dn.donors.map((d) => `
      <tr>
        <td>${escapeHtml(d.anon_id)}</td>
        <td>${escapeHtml(d.name || " - ")}</td>
        <td>${BDC.chips.blood(d.blood_group || " - ")}</td>
        <td>${escapeHtml(d.city || " - ")}</td>
        <td>${BDC.chips.eligibility(d.eligibility)}</td>
        <td>${d.available ? `<span class="badge badge--ok">Yes</span>` : `<span class="badge">No</span>`}</td>
        <td>${d.verified_donation_count}</td>
      </tr>`).join("")}</tbody>`;

  // ---- donations table ----
  const do_ = await BDC.api.get("/admin/donations?per_page=40");
  $("#donationsTable").innerHTML = `
    <thead><tr><th>Donor</th><th>Request</th><th>Group</th><th>Date</th><th>Verified</th></tr></thead>
    <tbody>${do_.donations.length ? do_.donations.map((d) => `
      <tr>
        <td>${escapeHtml(d.donor_anon || " - ")}</td>
        <td>#${d.request_id ?? " - "}</td>
        <td>${BDC.chips.blood(d.blood_group || " - ")}</td>
        <td>${fmt.date(d.donation_date)}</td>
        <td>${d.verified ? icon("check-circle", 16) : " - "}</td>
      </tr>`).join("") : `<tr><td colspan="5" class="muted">No confirmed donations yet.</td></tr>`}</tbody>`;
})();
