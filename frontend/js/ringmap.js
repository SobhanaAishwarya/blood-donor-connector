/* Ring / fan-out matching visualisation.
   Used on the landing hero (idealised loop) and the live request tracker. */
window.BDC = window.BDC || {};
(function () {

const SVGNS = "http://www.w3.org/2000/svg";
const VB = 520;               // viewBox size
const CENTER = VB / 2;
const CORE_R = 16;

function el(name, attrs = {}) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/* deterministic angle for a donor id so a node keeps its position across polls */
function angleFor(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 3600) / 10;   // 0..360
}

class RingMap {
  constructor(container, { rings, maxKm } = {}) {
    this.container = container;
    this.rings = rings || [
      { ring: 1, max_km: 5, label: "0-5 km" },
      { ring: 2, max_km: 10, label: "5-10 km" },
      { ring: 3, max_km: 20, label: "10-20 km" },
    ];
    this.maxKm = maxKm || this.rings[this.rings.length - 1].max_km;
    this.activeRing = 1;
    this.passed = new Set();
    this._nodes = [];
    this._build();
  }

  _usable() { return CENTER - 46; }

  /* radius of the drawn circle for ring index i (0-based); i = -1 → core edge */
  _radiusForRing(i) {
    if (i < 0) return CORE_R + 10;
    return ((i + 1) / this.rings.length) * this._usable();
  }

  /* map a distance in km onto a radius, consistent with the drawn ring bands */
  _radiusForKm(km) {
    if (km == null || !isFinite(km)) return this._radiusForRing(0) * 0.6;
    let idx = this.rings.findIndex((r) => km >= r.min_km && km < r.max_km);
    if (idx === -1) idx = km < this.rings[0].min_km ? 0 : this.rings.length - 1;
    const band = this.rings[idx];
    const inner = this._radiusForRing(idx - 1);
    const outer = this._radiusForRing(idx);
    const span = Math.max(1, band.max_km - band.min_km);
    const frac = Math.min(1, Math.max(0, (km - band.min_km) / span));
    return inner + frac * (outer - inner);
  }

  _build() {
    const svg = el("svg", { viewBox: `0 0 ${VB} ${VB}`, role: "img" });
    svg.setAttribute("aria-label", "Nearby donor matching visualisation");
    this.svg = svg;

    // rings
    this.ringEls = this.rings.map((r, i) => {
      const c = el("circle", {
        class: "ringmap__ring", cx: CENTER, cy: CENTER, r: this._radiusForRing(i),
      });
      svg.appendChild(c);
      const label = el("text", {
        class: "ringmap__label", x: CENTER, y: CENTER - this._radiusForRing(i) - 8,
        "text-anchor": "middle",
      });
      label.textContent = r.label;
      svg.appendChild(label);
      return c;
    });

    // core
    svg.appendChild(el("circle", {
      class: "ringmap__core-pulse", cx: CENTER, cy: CENTER, r: CORE_R + 6,
    }));
    svg.appendChild(el("circle", {
      class: "ringmap__core", cx: CENTER, cy: CENTER, r: CORE_R,
    }));
    const plus = el("path", {
      d: `M${CENTER - 6} ${CENTER} h12 M${CENTER} ${CENTER - 6} v12`,
      stroke: "#fff", "stroke-width": 2.4, "stroke-linecap": "round",
    });
    svg.appendChild(plus);

    this.nodeLayer = el("g", { class: "ringmap__nodes" });
    svg.appendChild(this.nodeLayer);

    this.container.innerHTML = "";
    this.container.classList.add("ringmap");
    this.container.appendChild(svg);
    this._paintRings();
  }

  _paintRings() {
    this.ringEls.forEach((c, i) => {
      const ring = i + 1;
      c.classList.toggle("is-active", ring === this.activeRing && !this._allAccepted());
      c.classList.toggle("is-passed", this.passed.has(ring));
    });
  }

  _allAccepted() { return this._nodes.some((n) => n.state === "accepted"); }

  setActiveRing(n) { this.activeRing = n; this._paintRings(); }
  setPassed(list) { this.passed = new Set(list || []); this._paintRings(); }

  setNodes(nodes) {
    this._nodes = nodes || [];
    this.nodeLayer.innerHTML = "";
    this._nodes.forEach((n) => {
      const ang = (angleFor(n.id) * Math.PI) / 180;
      const rad = n.distanceKm != null
        ? this._radiusForKm(n.distanceKm)
        : this._radiusForRing((n.ring || 1) - 0.35);
      const x = CENTER + rad * Math.cos(ang);
      const y = CENTER + rad * Math.sin(ang);

      const g = el("g", { class: `node node--${n.state || "idle"}`, transform: `translate(${x} ${y})` });
      g.appendChild(el("circle", { class: "node__ring", r: 8 }));
      g.appendChild(el("circle", { class: "node__dot" }));
      if (n.bloodGroup) {
        const t = el("text", {
          x: 0, y: -13, "text-anchor": "middle",
          "font-size": 10, "font-weight": 700, fill: "var(--text-soft)",
        });
        t.textContent = n.bloodGroup;
        g.appendChild(t);
      }
      const title = el("title");
      title.textContent = `${n.label || n.id}${n.distanceKm != null ? " · " + BDC.fmt.distance(n.distanceKm) : ""}`;
      g.appendChild(title);
      this.nodeLayer.appendChild(g);
    });
    this._paintRings();
  }

  /* landing-page idealised loop */
  demoLoop() {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const groups = ["O+", "A+", "O-", "B+", "AB+", "A-", "O+", "B-"];
    const bandMid = { 1: 2.6, 2: 7.4, 3: 14.5 };
    const make = (ring, state) => Array.from({ length: ring === 1 ? 5 : ring === 2 ? 4 : 3 }, (_, i) => ({
      id: `r${ring}-${i}`, ring,
      distanceKm: bandMid[ring] + ((i % 3) - 1) * (ring === 1 ? 1.4 : 2),
      bloodGroup: groups[(ring * 3 + i) % groups.length], state,
    }));

    const frames = [
      () => { this.setActiveRing(1); this.setPassed([]); this.setNodes(make(1, "idle")); },
      () => this.setNodes(make(1, "contacted")),
      () => {
        const n = make(1, "contacted");
        n[2].state = "accepted";
        this.setNodes(n);
      },
      () => {
        this.setActiveRing(2); this.setPassed([1]);
        this.setNodes([...make(1, "declined"), ...make(2, "contacted")]);
      },
      () => {
        const n = [...make(1, "declined"), ...make(2, "contacted")];
        n[n.length - 2].state = "accepted";
        this.setNodes(n);
      },
    ];
    let i = 0;
    const run = () => { frames[i % frames.length](); i++; };
    run();
    if (reduce) { this.setNodes([...make(1, "contacted")]); return; }
    this._demoTimer = setInterval(run, 2600);
  }

  destroy() { clearInterval(this._demoTimer); }
}

BDC.RingMap = { create: (container, opts) => new RingMap(container, opts) };
})();
