/* Login page logic. */
(async function () {
  const { $, icon } = BDC;

  $("#brandMark").innerHTML = icon("drop", 19);
  $("#asidePoints").innerHTML = [
    ["shield-check", "Eligibility is calculated automatically — no ineligible donors are shown."],
    ["lock", "Contact details stay hidden until a donor accepts."],
    ["route", "The nearest 5 donors are contacted first, then the search widens."],
  ].map(([ic, t]) => `<div>${icon(ic, 20)}<span>${t}</span></div>`).join("");

  $("#demoPills").innerHTML = [
    ["Donor", "aishwarya@blooddonor.test"],
    ["Requester", "requester@blooddonor.test"],
    ["Admin", "admin@blooddonor.test"],
  ].map(([role, email]) =>
    `<button class="badge" data-email="${email}" style="cursor:pointer">${role}: ${email}</button>`
  ).join("");
  $("#demoPills").addEventListener("click", (e) => {
    const b = e.target.closest("[data-email]");
    if (!b) return;
    $("#email").value = b.dataset.email;
    $("#password").value = "Passw0rd!";
    $("#password").focus();
  });

  // already signed in? move along
  if (BDC.token.get()) {
    const me = await BDC.session.load();
    if (me) location.href = nextUrl() || BDC.homeFor(me.user.role);
  }

  function nextUrl() {
    const n = BDC.qs("next");
    return n && n.startsWith("/") ? n : null;
  }

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    BDC.form.clearErrors(form);
    const body = BDC.form.read(form);
    const btn = $("#submitBtn");
    BDC.form.busy(btn, true, "Signing in…");
    try {
      const data = await BDC.api.post("/auth/login", body, { auth: false });
      BDC.token.set(data.token);
      BDC.session.set(data);
      BDC.toast(`Welcome back, ${data.user.name.split(" ")[0]}.`, "ok", 1800);
      setTimeout(() => (location.href = nextUrl() || BDC.homeFor(data.user.role)), 500);
    } catch (err) {
      BDC.form.busy(btn, false);
      if (err.errors) BDC.form.showErrors(form, err.errors);
      BDC.toast(err.message, "err");
    }
  });
})();
