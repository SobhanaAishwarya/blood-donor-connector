/* Landing page: nav, ring visualisations, feature/testimonial content, counters. */
(async function () {
  const { $, icon } = BDC;

  await BDC.session.load();
  BDC.mountNav();

  $("#year").textContent = new Date().getFullYear();
  $("#footMark").innerHTML = icon("drop", 19);

  // step icons
  const stepIcons = { s1: "droplets", s2: "shield-check", s3: "route", s4: "heart" };
  Object.entries(stepIcons).forEach(([id, name]) => {
    const n = $("#" + id);
    if (n) n.innerHTML = icon(name, 20);
  });

  // features
  const features = [
    ["shield-check", "Eligibility-aware matching", "Donors in their rest period are automatically excluded - no bypass, ever."],
    ["target", "Nearest-first matching", "The closest 5 eligible donors are contacted before anyone further away."],
    ["lock", "Privacy protection", "Requesters see an anonymous ID, blood group and rough distance - nothing more."],
    ["activity", "Availability status", "Donors flip a single switch when they can or can't help right now."],
    ["shield", "Verified donation history", "Confirmed donations build a trustworthy record and update eligibility."],
    ["route", "Intelligent fan-out", "Silence expands the radius ring by ring, so no one is spammed."],
  ];
  $("#featureGrid").innerHTML = features.map(([ic, t, d]) => `
    <article class="feature" data-reveal>
      <div class="feature__icon">${icon(ic, 22)}</div>
      <h3>${t}</h3>
      <p>${d}</p>
    </article>`).join("");

  // testimonials
  const quotes = [
    ["We raised a request at 2am and had a confirmed O- donor 3 km away before sunrise.", "Ananya R.", "Requester, Visakhapatnam"],
    ["I only get contacted when I'm actually able to donate. No guilt, no spam.", "Vikram S.", "Donor · 6 donations"],
    ["The anonymous-until-accept flow made my family comfortable signing up.", "Meera K.", "Donor, Madhurawada"],
  ];
  $("#quoteGrid").innerHTML = quotes.map(([q, who, role]) => `
    <figure class="quote" data-reveal>
      <div class="stars" aria-label="5 out of 5">★★★★★</div>
      <p>“${q}”</p>
      <figcaption class="quote__who">
        <span class="avatar">${who.split(" ").map((s) => s[0]).join("")}</span>
        <span><b>${who}</b><span>${role}</span></span>
      </figcaption>
    </figure>`).join("");

  BDC.initReveal();

  // ring visualisations
  let cfg = null;
  try { cfg = await BDC.api.get("/config", { auth: false }); } catch { /* offline ok */ }
  const rings = ((cfg && cfg.rings) || []).slice(0, 3);
  const opts = rings.length ? { rings, maxKm: rings[rings.length - 1].max_km } : {};

  const hero = BDC.RingMap.create($("#heroRing"), opts);
  hero.demoLoop();

  const viz = BDC.RingMap.create($("#vizRing"), opts);
  viz.demoLoop();

  // fake countdown on the matching section
  let secs = 272;
  const clockEl = $("#vizClock");
  setInterval(() => {
    secs = secs <= 0 ? 272 : secs - 1;
    clockEl.textContent = BDC.fmt.clock(secs);
  }, 1000);

  // impact counters (real data + demo baseline from API)
  try {
    const s = await BDC.api.get("/stats/impact", { auth: false });
    const map = {
      impDonors: s.donors_registered,
      impFulfilled: s.requests_fulfilled,
      impLives: s.lives_supported,
      impEligible: s.eligible_donors_available,
    };
    Object.entries(map).forEach(([id, v]) => { $("#" + id).dataset.count = v; });
  } catch {
    ["impDonors:4820", "impFulfilled:1163", "impLives:3120", "impEligible:18"]
      .forEach((pair) => { const [id, v] = pair.split(":"); $("#" + id).dataset.count = v; });
  }
  BDC.observeCounters();
})();
