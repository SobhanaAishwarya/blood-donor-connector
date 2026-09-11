/* Registration: role choice → requester form OR 5-step donor wizard. */
(async function () {
  const { $, $$, icon, escapeHtml } = BDC;

  await BDC.session.load();
  BDC.mountNav();
  if (BDC.session.get()) { location.href = BDC.homeFor(BDC.session.get().user.role); return; }

  const steps = [
    ["About You", "1"], ["Blood", "2"], ["Location", "3"],
    ["Availability", "4"], ["Done", "5"],
  ];

  const roleStep = $("#roleStep");
  const requesterStep = $("#requesterStep");
  const donorStep = $("#donorStep");

  // ---- role selection ----
  const roleNext = $("#roleNext");
  $$('input[name="role"]', roleStep).forEach((r) =>
    r.addEventListener("change", () => (roleNext.disabled = false)));
  roleNext.addEventListener("click", () => {
    const role = $('input[name="role"]:checked', roleStep).value;
    roleStep.classList.add("hide");
    if (role === "requester") requesterStep.classList.remove("hide");
    else { donorStep.classList.remove("hide"); initWizard(); }
  });
  $("#reqBack").addEventListener("click", () => back(requesterStep));
  $("#donorBack").addEventListener("click", () => back(donorStep));
  function back(section) {
    section.classList.add("hide");
    roleStep.classList.remove("hide");
  }

  // ---- requester ----
  $("#requesterForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    BDC.form.clearErrors(form);
    const btn = $("#rqSubmit");
    BDC.form.busy(btn, true, "Creating…");
    try {
      const body = { ...BDC.form.read(form), role: "requester" };
      const data = await BDC.api.post("/auth/register", body, { auth: false });
      BDC.token.set(data.token);
      BDC.toast("Account created. Let's raise your request.", "ok", 1800);
      setTimeout(() => (location.href = "/request.html"), 550);
    } catch (err) {
      BDC.form.busy(btn, false);
      if (err.errors) BDC.form.showErrors(form, err.errors);
      BDC.toast(err.message, "err");
    }
  });

  // ---- donor wizard ----
  let cur = 1;
  const form = $("#donorForm");

  function initWizard() {
    renderStepper();
    // blood group picker
    $("#groupPicker").innerHTML = BDC.BLOOD_GROUPS.map((g) =>
      `<button type="button" class="badge badge--lg" data-g="${g}" style="cursor:pointer">${g}</button>`).join("");
    $("#groupPicker").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      $$("#groupPicker [data-g]").forEach((x) => x.classList.remove("badge--blood"));
      b.classList.add("badge--blood");
      form.elements.blood_group.value = b.dataset.g;
    });
    // cities
    BDC.api.get("/config", { auth: false }).then((cfg) => {
      const cities = Object.keys((cfg && cfg.city_coords) || {});
      $("#cityList").innerHTML = cities.map((c) => `<option value="${c}">`).join("");
    }).catch(() => {});
  }

  function renderStepper() {
    $("#stepper").innerHTML = steps.map(([label, n], i) => {
      const state = cur > i + 1 ? "is-done" : cur === i + 1 ? "is-active" : "";
      const line = i < steps.length - 1
        ? `<div class="stepper__line ${cur > i + 1 ? "is-done" : ""}"></div>` : "";
      return `<div class="stepper__node ${state}">
        <div class="stepper__bullet">${cur > i + 1 ? icon("check", 15) : n}</div>
        <div class="stepper__label">${label}</div>
      </div>${line}`;
    }).join("");
  }

  function showPanel(n) {
    $$(".wizard__panel", form).forEach((p) =>
      p.classList.toggle("hide", +p.dataset.panel !== n));
    $("#wizPrev").classList.toggle("hide", n === 1);
    $("#wizNext").classList.toggle("hide", n === steps.length);
    $("#wizSubmit").classList.toggle("hide", n !== steps.length);
    cur = n;
    renderStepper();
    if (n === 5) renderReview();
    form.querySelector(`[data-panel="${n}"] input, [data-panel="${n}"] button`)?.focus();
  }

  function validateStep(n) {
    const errs = {};
    const d = BDC.form.read(form);
    if (n === 1) {
      if (!d.name || d.name.length < 2) errs.name = "Enter your name.";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || "")) errs.email = "Enter a valid email.";
      if (!/^(?:\+?91[-\s]?|0)?[6-9]\d{9}$/.test((d.phone || "").replace(/[\s-]/g, ""))) errs.phone = "Enter a valid 10-digit mobile.";
      if (!d.password || d.password.length < 8 || !/[A-Za-z]/.test(d.password) || !/\d/.test(d.password))
        errs.password = "8+ characters with at least one letter and one number.";
    }
    if (n === 2) {
      if (!d.blood_group) errs.blood_group = "Pick your blood group.";
      if (!d.gender) errs.gender = "Select one.";
    }
    if (n === 3) {
      if (!d.city || d.city.length < 2) errs.city = "Enter your city.";
    }
    BDC.form.showErrors(form, errs);
    return Object.keys(errs).length === 0;
  }

  $("#wizNext").addEventListener("click", () => {
    if (!validateStep(cur)) return;
    showPanel(Math.min(steps.length, cur + 1));
  });
  $("#wizPrev").addEventListener("click", () => showPanel(Math.max(1, cur - 1)));

  function renderReview() {
    const d = BDC.form.read(form);
    const rows = [
      ["Name", d.name],
      ["Email", d.email],
      ["Phone", d.phone],
      ["Blood group", d.blood_group],
      ["Sex", d.gender],
      ["Last donation", d.last_donation_date || "Never / unknown"],
      ["City", d.city],
      ["Locality", d.locality || "—"],
      ["Availability", d.available === "true" ? "Available" : "Not available"],
    ];
    $("#reviewList").innerHTML = rows.map(([k, v]) =>
      `<div class="spread" style="border-bottom:1px solid var(--border);padding-bottom:8px">
         <span class="muted" style="font-size:var(--fs-sm)">${k}</span>
         <b>${escapeHtml(v || "—")}</b></div>`).join("");

    // local eligibility preview (mirrors backend rule)
    const interval = d.gender === "female" ? 120 : 90;
    let html;
    if (!d.last_donation_date) {
      html = eligBox(true, "Eligible to donate", "No donation on record yet — you're good to go.");
    } else {
      const days = Math.floor((Date.now() - new Date(d.last_donation_date)) / 86400000);
      const rem = Math.max(0, interval - days);
      html = rem === 0
        ? eligBox(true, "Eligible to donate", `Your last donation was ${days} days ago.`)
        : eligBox(false, "Not eligible yet", `Please wait ${rem} more day${rem === 1 ? "" : "s"}.`);
    }
    $("#eligPreview").innerHTML = html;
  }

  function eligBox(ok, title, msg) {
    return `<div class="card card--flat" style="background:${ok ? "var(--ok-bg)" : "var(--warn-bg)"};border:1px solid ${ok ? "color-mix(in srgb,var(--ok) 35%,transparent)" : "color-mix(in srgb,var(--warn) 35%,transparent)"}">
      <div class="elig-headline" style="font-size:var(--fs-md)">
        <span class="glyph">${ok ? "🟢" : "🔴"}</span> ${title}
      </div>
      <p style="margin-top:4px;color:var(--text)">${msg}</p>
    </div>`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    for (let n = 1; n <= 3; n++) if (!validateStep(n)) { showPanel(n); return; }
    const d = BDC.form.read(form);
    const body = {
      name: d.name, email: d.email, phone: d.phone, password: d.password,
      role: "donor", blood_group: d.blood_group, gender: d.gender,
      city: d.city, locality: d.locality,
      last_donation_date: d.last_donation_date || null,
      available: d.available === "true",
    };
    const btn = $("#wizSubmit");
    BDC.form.busy(btn, true, "Creating…");
    try {
      const data = await BDC.api.post("/auth/register", body, { auth: false });
      BDC.token.set(data.token);
      BDC.toast("Welcome aboard — your donor profile is live.", "ok", 2000);
      setTimeout(() => (location.href = "/dashboard.html"), 600);
    } catch (err) {
      BDC.form.busy(btn, false);
      if (err.errors) {
        BDC.form.showErrors(form, err.errors);
        const firstField = Object.keys(err.errors)[0];
        const panel = form.querySelector(`[name="${firstField}"]`)?.closest("[data-panel]");
        if (panel) showPanel(+panel.dataset.panel);
      }
      BDC.toast(err.message, "err");
    }
  });

  window.__wizardShow = showPanel; // debug hook
})();
