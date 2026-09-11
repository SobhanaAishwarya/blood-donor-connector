/* Donor search - privacy-first, eligibility always enforced. */
(async function () {
  const { $, $$, icon, escapeHtml, fmt } = BDC;

  await BDC.session.load();
  BDC.mountNav("search");

  $("#eligLock").innerHTML =
    `${icon("shield-check", 14)} Eligibility filter is always on. Search results automatically exclude donors who can't donate today.`;

  const form = $("#filters");
  $("#fg").innerHTML = `<option value="">Any</option>` +
    BDC.BLOOD_GROUPS.map((g) => `<option value="${g}">${g}</option>`).join("");

  try {
    const cfg = await BDC.api.get("/config", { auth: false });
    $("#cityList").innerHTML = Object.keys(cfg.city_coords || {}).map((c) => `<option value="${c}">`).join("");
  } catch { /* ok */ }

  // preload from query string (e.g. ?blood_group=O%2B)
  const q = new URLSearchParams(location.search);
  ["blood_group", "city", "match", "max_distance", "available"].forEach((k) => {
    const el = form.elements[k];
    if (el && q.get(k)) el.value = q.get(k);
  });

  const run = BDC.debounce(search, 260);
  form.addEventListener("input", run);
  form.addEventListener("submit", (e) => { e.preventDefault(); search(); });
  search();

  async function search() {
    const results = $("#results");
    results.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton skeleton--card"></div>`).join("");
    const params = new URLSearchParams();
    Object.entries(BDC.form.read(form)).forEach(([k, v]) => { if (v) params.set(k, v); });

    let data;
    try { data = await BDC.api.get(`/donors/search?${params.toString()}`, { auth: false }); }
    catch (err) {
      results.innerHTML = "";
      $("#resultCount").textContent = "";
      BDC.toast(err.message, "err");
      return;
    }

    $("#resultCount").textContent =
      `${data.count} eligible donor${data.count === 1 ? "" : "s"}${params.get("city") ? " in " + params.get("city") : ""}`;

    if (!data.donors.length) {
      results.className = "";
      results.innerHTML = `<div class="empty">
        <div class="empty__art">${icon("users", 44)}</div>
        <h3>No eligible donors nearby</h3>
        <p>Try expanding the search area or changing the blood group. Only donors who can donate today are shown.</p>
        <button class="btn btn--primary btn--sm" id="expandBtn" style="margin-top:12px">${icon("route", 15)} Expand search</button>
      </div>`;
      $("#expandBtn").addEventListener("click", () => {
        $("#fdist").value = "";
        $("#favail").value = "";
        search();
      });
      return;
    }

    results.className = "donor-grid";
    results.innerHTML = data.donors.map((d) => {
      const e = d.eligibility || {};
      return `<article class="card card--interactive donor-card">
        <div class="donor-card__head">
          <span class="donor-card__id">Donor #${escapeHtml(d.anon_id)}</span>
          ${BDC.chips.blood(d.blood_group)}
        </div>
        <div class="donor-card__row">${icon("check-circle", 15)} ${e.eligible ? "Eligible to donate" : "Resting"}</div>
        <div class="donor-card__row">${icon("pin", 15)} ${escapeHtml(d.locality ? d.locality + ", " : "")}${escapeHtml(d.city || " - ")}</div>
        <div class="donor-card__row">${icon("route", 15)} ${d.distance_km != null ? "~" + fmt.distance(d.distance_km) + " away" : "Distance unknown"}</div>
        <div class="cluster" style="margin-top:2px">
          ${d.available ? `<span class="badge badge--ok"><span class="dot"></span> Available now</span>` : `<span class="badge"><span class="dot"></span> Unavailable</span>`}
          ${BDC.chips.eligibility(e)}
        </div>
        <div class="locked-note">${icon("lock", 14)} Contact details are shared only when this donor accepts a request.</div>
      </article>`;
    }).join("");
  }
})();
