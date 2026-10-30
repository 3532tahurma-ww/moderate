(function () {
  const KEY = "water";

  const W = 64, H = 96;
  const STEP = 1 / 60;
  const CFG = {
    flowMax: 4,        // cells poured per tick with the flow slider all the way right
    speedMin: 0.6,     // cells per tick leaving the nozzle at zero pressure...
    speedMax: 3.2,     // ...and at full pressure
    lanes: 7,          // widest the nozzle gets, in cells
    gravMin: 0.01,     // cells per tick² at slider 0...
    gravMax: 0.12,     // ...and at slider 100
    vyMax: 3,
    drag: 0.08,        // air drag at full viscosity; dense liquid shrugs it off
    inertia: 2,        // how much density cancels drag
    visc: 0.9,         // resting cell skips a move with chance visc × slider × density²
    bounce: 0.25,      // only walls bounce; liquid hitting liquid takes on its speed
    friction: 0.85,    // sideways speed kept per tick while resting on something
    rest: 0.5,         // liquid below moving faster than this is still falling, not something to rest on
    spread: 5,         // max cells a resting cell slides sideways per tick
    mix: 0.008,        // density diffusion per tick; low enough that poured layers stay apart
    sink: 0.1,         // density gap before a heavier cell swaps with a lighter one below
    cap: 0.45,         // stop pouring above this fill ratio
    shade: 0.6,        // how much darker fully dense liquid is
    depthShade: 0.12,  // extra darkening deep inside a pool
    trail: 4,          // max cells of motion trail drawn behind fast cells
    brush: 1,
    grab: 3,           // pointer this close to the nozzle moves it, farther away aims it
  };
  const LANES = [0, 1, -1, 2, -2, 3, -3];
  const DEFAULT_COLOR = "#3d9be9";

  const PARAMS = [
    { k: "flow", label: "Akış", min: 0, max: 100, def: 40, unit: "" },
    { k: "press", label: "Basınç", min: 0, max: 100, def: 40, unit: "" },
    { k: "angle", label: "Açı", min: -180, max: 180, def: 0, unit: "°" },
    { k: "dens", label: "Yoğunluk", min: 0, max: 100, def: 0, unit: "" },
    { k: "grav", label: "Yerçekimi", min: 0, max: 100, def: 50, unit: "" },
    { k: "visc", label: "Kıvam", min: 0, max: 100, def: 20, unit: "" },
  ];

  const BG = [26, 29, 38];
  const WALL = [220, 195, 166];
  const WALL_TOP = [240, 220, 194];

  let ctx, root, els, raf, S, buf, bctx, img, cs = 1, onKey, onVis, ghost, depth;
  const onResize = () => resize();
  const P = {};

  const idx = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const free = (x, y) => inside(x, y) && !S.wall[idx(x, y)] && !S.liq[idx(x, y)];

  function template() {
    const rows = PARAMS.map((p) => `
      <label class="presia-feed water-row">
        <span class="col-label">${p.label}</span>
        <input type="range" min="${p.min}" max="${p.max}" value="${P[p.k]}" data-p="${p.k}" aria-label="${p.label}">
        <b class="water-val" data-v="${p.k}"></b>
      </label>`).join("");
    return `
      <div class="weita water">
        <div class="weita-hud">
          <span class="pill">Sıvı: <b data-el="count">0</b></span>
          <button class="pill pill-btn" data-el="pauseBtn">⏸ Durdur</button>
          <button class="pill pill-btn" data-el="drain">🚿 Boşalt</button>
          <button class="pill pill-btn" data-el="walls">🧱 Sıfırla</button>
        </div>
        <div class="water-tools" data-el="tools">
          <button class="pill pill-btn on" data-tool="wall">✏️ Duvar</button>
          <button class="pill pill-btn" data-tool="erase">🧽 Sil</button>
          <button class="pill pill-btn" data-tool="emit">📍 Yayıcı</button>
        </div>
        <div class="presia-box water-box" data-el="box"><canvas data-el="canvas"></canvas></div>
        <div class="presia-controls">${rows}
          <label class="presia-feed water-row">
            <span class="col-label">Renk</span>
            <input type="color" value="${P.color}" data-el="color" aria-label="Sıvının rengi">
            <b class="water-val"></b>
          </label>
        </div>
        <p class="weita-hint">Duvar çiz. Yayıcı: noktayı sürükle taşı, başka yere bas yönlendir. Boşluk: durdur.</p>
      </div>`;
  }

  function loadParams() {
    const saved = ctx.storage.get(KEY + ":cfg", {});
    PARAMS.forEach((p) => {
      const v = saved[p.k];
      P[p.k] = typeof v === "number" ? Math.max(p.min, Math.min(p.max, v)) : p.def;
    });
    P.color = /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : DEFAULT_COLOR;
  }

  function setParam(k, v) {
    const p = PARAMS.find((q) => q.k === k);
    P[k] = v;
    els.inputs[k].value = v;
    els.vals[k].textContent = v + p.unit;
    ctx.storage.set(KEY + ":cfg", P);
  }

  function defaultWalls() {
    S.wall.fill(0);
    const left = 12, right = W - 13, floor = H - 12;
    for (let x = left; x <= right; x++) S.wall[idx(x, floor)] = 1;
    for (let y = floor - 22; y <= floor; y++) { S.wall[idx(left, y)] = 1; S.wall[idx(right, y)] = 1; }
  }

  function reset() {
    S = {
      paused: false,
      tool: "wall",
      wall: new Uint8Array(W * H),
      liq: new Uint8Array(W * H),
      dens: new Float32Array(W * H),
      vx: new Float32Array(W * H),
      vy: new Float32Array(W * H),
      rx: new Float32Array(W * H),
      ry: new Float32Array(W * H),
      moved: new Uint32Array(W * H),
      stuck: new Uint32Array(W * H),  // tick in which the cell at this spot was blocked and couldn't move at all
      lane: new Float32Array(CFG.lanes),
      tick: 0,
      acc: 0,
      last: 0,
      count: 0,
      ex: W >> 1,
      ey: 6,
      pointer: null,
      prev: null,
      grab: null,
    };
    defaultWalls();
  }

  function put(i, v) {
    S.liq[i] = 1;
    S.dens[i] = v.d;
    S.vx[i] = v.vx;
    S.vy[i] = v.vy;
    S.rx[i] = 0;
    S.ry[i] = 0;
  }

  function clear(i) {
    S.liq[i] = 0;
    S.dens[i] = 0;
    S.vx[i] = 0;
    S.vy[i] = 0;
    S.rx[i] = 0;
    S.ry[i] = 0;
  }

  function mv(i, j) {
    put(j, { d: S.dens[i], vx: S.vx[i], vy: S.vy[i] });
    S.rx[j] = S.rx[i];
    S.ry[j] = S.ry[i];
    S.moved[j] = S.tick;
    clear(i);
  }

  function swap(i, j) {
    const d = S.dens[i], vx = S.vx[i], vy = S.vy[i];
    S.dens[i] = S.dens[j]; S.vx[i] = S.vx[j]; S.vy[i] = S.vy[j];
    S.dens[j] = d; S.vx[j] = vx; S.vy[j] = vy;
    S.moved[i] = S.moved[j] = S.tick;
  }

  const dirVec = () => {
    const a = (P.angle * Math.PI) / 180;
    return [Math.sin(a), Math.cos(a)]; // 0° = straight down, 90° = right
  };

  function emit() {
    const rate = CFG.flowMax * (P.flow / 100);
    if (!rate || S.count > W * H * CFG.cap) return 0;
    let poured = 0;
    const [dx, dy] = dirVec();
    const speed = CFG.speedMin + (CFG.speedMax - CFG.speedMin) * (P.press / 100);
    // Lanes sit side by side across the main axis of the jet.
    const [sx, sy] = Math.abs(dy) >= Math.abs(dx) ? [1, 0] : [0, 1];
    // A lane pours at most one cell per cell the stream travels, or cells pile onto each other; more flow widens the nozzle instead.
    const lanes = Math.max(1, Math.min(CFG.lanes, Math.ceil(rate / speed)));
    const q = rate / lanes;
    for (let l = 0; l < CFG.lanes; l++) {
      if (l >= lanes) { S.lane[l] = 0; continue; }
      S.lane[l] = Math.min(S.lane[l] + q, q + 1);
      while (S.lane[l] >= 1) {
        // A cell poured earlier in the tick has already flown further: place it there, keeping the fraction,
        // so every cell of the jet stays in step instead of bunching up in clumps.
        // Split it the way moving cells store it (whole cells + a remainder in the direction of travel), or the two collide.
        // If that spot is taken, fall back toward the nozzle; if even that is blocked, wait for the next tick instead of losing it.
        let along = Math.min(1, (S.lane[l] - 1) / q) * speed, ox, oy, x, y;
        for (; along >= 0; along -= 1) {
          ox = dx * along; oy = dy * along;
          x = S.ex + sx * LANES[l] + Math.trunc(ox); y = S.ey + sy * LANES[l] + Math.trunc(oy);
          if (free(x, y)) break;
        }
        if (along < 0) break;
        S.lane[l] -= 1;
        const i = idx(x, y);
        put(i, { d: P.dens / 100, vx: dx * speed, vy: dy * speed });
        S.rx[i] = ox - Math.trunc(ox);
        S.ry[i] = oy - Math.trunc(oy);
        S.moved[i] = S.tick;
        poured++;
      }
    }
    return poured;
  }

  function whole(r, v) {
    const t = r + v;
    return t >= 1 ? 1 : t <= -1 ? -1 : 0;
  }

  // Cell i ran into (bx, by) along one axis: walls bounce it, liquid carries it along at its speed. Liquid that is itself
  // stuck this tick stops it instead, whatever speed it has stored, or a jammed column never settles.
  // Returns true for something solid (a wall or stuck liquid), as opposed to liquid that will move on.
  function hit(v, i, bx, by) {
    const j = inside(bx, by) ? idx(bx, by) : -1;
    if (j >= 0 && S.liq[j] && S.stuck[j] !== S.tick) { v[i] = v[j]; return false; }
    if (j >= 0 && S.liq[j]) v[i] = 0;
    else v[i] = Math.abs(v[i]) > 1.5 ? -v[i] * CFG.bounce * (1 - P.visc / 100) : 0;
    return true;
  }

  // Moves one cell. Returns true when it is stuck behind liquid that hasn't moved yet this tick, so it can retry afterwards.
  function update(i, x, y, g, visc, defer) {
    const d = S.dens[i];
    const vx0 = S.vx[i], vy0 = S.vy[i], rx0 = S.rx[i], ry0 = S.ry[i];

    S.vy[i] = Math.min(CFG.vyMax, S.vy[i] + g);
    const drag = 1 - (CFG.drag * visc) / (1 + d * CFG.inertia);
    S.vx[i] *= drag;
    S.vy[i] *= drag;

    const speed = Math.abs(S.vx[i]) + Math.abs(S.vy[i]);
    if (speed < 0.6 && Math.random() < CFG.visc * visc * d * d) return false;

    const n = Math.max(1, Math.ceil(Math.max(Math.abs(S.vx[i]), Math.abs(S.vy[i]))));
    const sx = S.vx[i] / n, sy = S.vy[i] / n;
    let cx = x, cy = y, went = false;
    for (let s = 0; s < n; s++) {
      const dx = whole(S.rx[i], sx), dy = whole(S.ry[i], sy);
      S.rx[i] += sx - dx;
      S.ry[i] += sy - dy;
      if (!dx && !dy) continue;
      let mx = dx, my = dy;
      if (!free(cx + dx, cy + dy)) {
        const j = idx(cx + dx, cy + dy);
        if (defer && !went && inside(cx + dx, cy + dy) && S.liq[j] && S.moved[j] !== S.tick) {
          S.vx[i] = vx0; S.vy[i] = vy0; S.rx[i] = rx0; S.ry[i] = ry0;
          return true;
        }
        if (dx && dy && free(cx + dx, cy)) { my = 0; hit(S.vy, i, cx + dx, cy + dy); }
        else if (dx && dy && free(cx, cy + dy)) { mx = 0; hit(S.vx, i, cx + dx, cy + dy); }
        else {
          // Only a solid obstacle makes this cell stuck too; stuck behind a cell that is merely slower would stop the whole jet.
          let solid = false;
          if (dx) solid = hit(S.vx, i, cx + dx, cy) || solid;
          if (dy) solid = hit(S.vy, i, cx, cy + dy) || solid;
          S.rx[i] = S.ry[i] = 0;
          if (!went && solid) S.stuck[i] = S.tick;
          break;
        }
      }
      const j = idx(cx + mx, cy + my);
      mv(i, j);
      i = j; cx += mx; cy += my; went = true;
    }
    // Still in the air (nothing below, or only more of the moving stream), just waiting for its fractional speed to add up: leave it alone.
    if (went || g === 0 || free(cx, cy + 1)) return false;
    const below = i + W;
    if (cy + 1 < H && S.liq[below] && Math.abs(S.vx[below]) + Math.abs(S.vy[below]) > CFG.rest) return false;

    // Resting on something: dense liquid sinks under lighter, otherwise it slumps and levels out.
    S.vx[i] *= CFG.friction;
    if (cy + 1 < H && S.liq[below] && d > S.dens[below] + CFG.sink && Math.random() < 0.5) { swap(i, below); return false; }
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (free(cx + dir, cy + 1)) { S.vx[i] = dir * 0.2; mv(i, i + W + dir); return false; }
    if (free(cx - dir, cy + 1)) { S.vx[i] = -dir * 0.2; mv(i, i + W - dir); return false; }
    const reach = Math.max(1, Math.round(CFG.spread * (1 - visc * 0.8)));
    for (const sd of [dir, -dir]) {
      let nx = cx;
      for (let r = 0; r < reach && free(nx + sd, cy); r++) nx += sd;
      if (nx !== cx) { mv(i, i + nx - cx); return false; }
    }
    S.stuck[i] = S.tick;
    return false;
  }

  function step() {
    const g = CFG.gravMin + (CFG.gravMax - CFG.gravMin) * (P.grav / 100);
    const visc = P.visc / 100;
    S.tick++;

    const flip = S.tick & 1;
    const later = [];
    let count = 0;
    for (let y = H - 1; y >= 0; y--) {
      for (let k = 0; k < W; k++) {
        const x = flip ? k : W - 1 - k;
        const i = idx(x, y);
        if (!S.liq[i]) continue;
        count++;
        if (S.moved[i] !== S.tick && update(i, x, y, g, visc, true)) later.push(i);
      }
    }
    // Cells that queued up behind the stream's leading edge move now that it has gone ahead, so jets stay unbroken in any direction.
    for (let n = later.length - 1; n >= 0; n--) {
      const i = later[n];
      if (S.liq[i] && S.moved[i] !== S.tick) update(i, i % W, (i / W) | 0, g, visc, false);
    }
    // Pour after everything has moved, so the new cells fill the space the jet just left.
    count += emit();

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = idx(x, y);
        if (!S.liq[i]) continue;
        if (S.liq[i + 1]) { const m = (S.dens[i] - S.dens[i + 1]) * CFG.mix; S.dens[i] -= m; S.dens[i + 1] += m; }
        if (y < H - 1 && S.liq[i + W]) { const m = (S.dens[i] - S.dens[i + W]) * CFG.mix; S.dens[i] -= m; S.dens[i + W] += m; }
      }
    }
    S.count = count;
  }

  function loop(now) {
    if (S.paused) return;
    const dt = Math.min(0.05, (now - S.last) / 1000);
    S.last = now;
    S.acc += dt;
    let n = 0;
    while (S.acc >= STEP && n < 4) { step(); S.acc -= STEP; n++; }
    if (n === 4) S.acc = 0;
    render();
    raf = requestAnimationFrame(loop);
  }

  function setPaused(p) {
    S.paused = p;
    els.pauseBtn.textContent = p ? "▶ Devam" : "⏸ Durdur";
    cancelAnimationFrame(raf);
    if (!p) { S.last = performance.now(); raf = requestAnimationFrame(loop); }
    render();
  }

  function resize() {
    const r = els.box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cs = Math.max(1, Math.floor(Math.min(r.width / W, r.height / H) * dpr));
    els.canvas.width = W * cs;
    els.canvas.height = H * cs;
    els.canvas.style.width = (W * cs) / dpr + "px";
    els.canvas.style.height = (H * cs) / dpr + "px";
    render();
  }

  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  const lighten = (c, k) => c + (255 - c) * k;

  function draw() {
    const px = img.data, col = hexRgb(P.color);

    // A falling stream speeds up and thins out, and a one cell wide stream can only thin into dots.
    // Fast cells smear back over the whole distance they covered this tick, so it still reads as one line.
    ghost.fill(-1);
    for (let i = 0; i < W * H; i++) {
      if (!S.liq[i]) continue;
      const vx = S.vx[i], vy = S.vy[i], sp = Math.max(Math.abs(vx), Math.abs(vy));
      if (sp <= 1) continue;
      const x = i % W, y = (i / W) | 0, len = Math.min(CFG.trail, Math.ceil(sp));
      for (let t = 1; t <= len; t++) {
        const gx = Math.round(x - (vx / sp) * t), gy = Math.round(y - (vy / sp) * t);
        if (!inside(gx, gy)) break;
        const j = idx(gx, gy);
        if (S.wall[j]) break;
        if (!S.liq[j] && ghost[j] < 0) ghost[j] = i;
      }
    }

    depth.fill(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y), o = i * 4;
        let r = BG[0], g = BG[1], b = BG[2];
        if (S.wall[i]) {
          depth[x] = 0;
          const c = y === 0 || !S.wall[i - W] ? WALL_TOP : WALL;
          r = c[0]; g = c[1]; b = c[2];
        } else if (S.liq[i] || ghost[i] >= 0) {
          const src = S.liq[i] ? i : ghost[i];
          const d = S.dens[src];
          depth[x] = S.liq[i] ? depth[x] + 1 : 0;
          // Same hue at any density, just darker the denser (and a touch darker deep in a pool).
          const f = 1 - CFG.shade * d - CFG.depthShade * Math.min(1, depth[x] / 24);
          const sp = Math.max(Math.abs(S.vx[src]), Math.abs(S.vy[src]));
          let k = Math.min(1, sp / 3) * 0.2;
          // Bright line on the surface of standing liquid only; on a jet it would just speckle.
          if (S.liq[i] && sp < CFG.rest && y > 0 && !S.liq[i - W] && !S.wall[i - W]) k += 0.2;
          const a = (0.78 + 0.22 * d) * (S.liq[i] ? 1 : 0.75);
          r = BG[0] + (lighten(col[0] * f, k) - BG[0]) * a;
          g = BG[1] + (lighten(col[1] * f, k) - BG[1]) * a;
          b = BG[2] + (lighten(col[2] * f, k) - BG[2]) * a;
        } else depth[x] = 0;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    const c = els.canvas.getContext("2d");
    c.clearRect(0, 0, els.canvas.width, els.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(buf, 0, 0, W * cs, H * cs);

    const [dx, dy] = dirVec();
    const ox = (S.ex + 0.5) * cs, oy = (S.ey + 0.5) * cs;
    c.save();
    c.strokeStyle = "#f28c38";
    c.fillStyle = "#f28c38";
    c.lineWidth = Math.max(2, cs * 0.5);
    c.beginPath();
    c.moveTo(ox, oy);
    c.lineTo(ox + dx * cs * 6, oy + dy * cs * 6);
    c.stroke();
    c.beginPath();
    c.arc(ox, oy, cs * 1.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function render() {
    draw();
    els.count.textContent = S.count;
  }

  function cellAt(e) {
    const r = els.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W - 1, Math.floor(((e.clientX - r.left) / r.width) * W))),
      Math.max(0, Math.min(H - 1, Math.floor(((e.clientY - r.top) / r.height) * H))),
    ];
  }

  function paint(x, y) {
    if (S.tool === "emit") {
      if (S.grab === "move") { S.ex = x; S.ey = y; }
      else if (x !== S.ex || y !== S.ey) setParam("angle", Math.round((Math.atan2(x - S.ex, y - S.ey) * 180) / Math.PI));
      return;
    }
    for (let yy = y - CFG.brush; yy <= y + CFG.brush; yy++) {
      for (let xx = x - CFG.brush; xx <= x + CFG.brush; xx++) {
        if (!inside(xx, yy)) continue;
        const i = idx(xx, yy);
        if (S.tool === "wall") { S.wall[i] = 1; clear(i); }
        else S.wall[i] = 0;
      }
    }
  }

  function stroke(e) {
    const [x, y] = cellAt(e);
    const [px, py] = S.prev || [x, y];
    const n = Math.max(Math.abs(x - px), Math.abs(y - py), 1);
    for (let s = 1; s <= n; s++) paint(Math.round(px + ((x - px) * s) / n), Math.round(py + ((y - py) * s) / n));
    S.prev = [x, y];
    if (S.paused) render();
  }

  function mount(container, context) {
    ctx = context;
    root = container;
    loadParams();
    root.innerHTML = template();
    els = { vals: {}, inputs: {} };
    root.querySelectorAll("[data-el]").forEach((n) => { els[n.dataset.el] = n; });
    root.querySelectorAll("[data-v]").forEach((n) => { els.vals[n.dataset.v] = n; });
    root.querySelectorAll("[data-p]").forEach((n) => { els.inputs[n.dataset.p] = n; });
    PARAMS.forEach((p) => setParam(p.k, P[p.k]));

    buf = document.createElement("canvas");
    buf.width = W;
    buf.height = H;
    bctx = buf.getContext("2d");
    img = bctx.createImageData(W, H);
    ghost = new Int32Array(W * H);
    depth = new Uint16Array(W);
    reset();

    Object.values(els.inputs).forEach((inp) => {
      inp.addEventListener("input", () => {
        setParam(inp.dataset.p, +inp.value);
        if (S.paused) render();
      });
    });
    els.color.addEventListener("input", () => {
      P.color = els.color.value;
      ctx.storage.set(KEY + ":cfg", P);
      if (S.paused) render();
    });
    els.tools.addEventListener("click", (e) => {
      const b = e.target.closest("[data-tool]");
      if (!b) return;
      S.tool = b.dataset.tool;
      els.tools.querySelectorAll("[data-tool]").forEach((n) => n.classList.toggle("on", n === b));
    });
    els.pauseBtn.addEventListener("click", () => setPaused(!S.paused));
    els.drain.addEventListener("click", () => {
      for (let i = 0; i < W * H; i++) clear(i);
      S.count = 0;
      render();
    });
    els.walls.addEventListener("click", () => { defaultWalls(); render(); });

    els.box.addEventListener("pointerdown", (e) => {
      els.box.setPointerCapture(e.pointerId);
      S.pointer = e.pointerId;
      S.prev = null;
      const [x, y] = cellAt(e);
      S.grab = Math.max(Math.abs(x - S.ex), Math.abs(y - S.ey)) <= CFG.grab ? "move" : "aim";
      stroke(e);
      e.preventDefault();
    });
    els.box.addEventListener("pointermove", (e) => { if (S.pointer === e.pointerId) stroke(e); });
    const onUp = (e) => { if (S.pointer === e.pointerId) { S.pointer = null; S.prev = null; } };
    els.box.addEventListener("pointerup", onUp);
    els.box.addEventListener("pointercancel", onUp);
    els.box.addEventListener("contextmenu", (e) => e.preventDefault());

    onKey = (e) => {
      if (ctx.guideOpen() || e.target.tagName === "INPUT") return;
      if (e.key === " ") setPaused(!S.paused);
      else return;
      e.preventDefault();
    };
    onVis = () => { if (document.hidden && !S.paused) setPaused(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    S.last = performance.now();
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => resize());
  }

  function unmount() {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
  }

  function pause() { if (S && !S.paused) setPaused(true); }

  const GUIDE = [
    { icon: "🌊", title: "Deney alanı", text: "Burası sıvı sistemlerini denediğin <b>laboratuvar</b>. Puan yok, sadece ayarlarla oyna ve sıvının nasıl davrandığını gör." },
    { icon: "📍", title: "Yayıcı", text: "Turuncu nokta sıvının çıktığı yer, çizgi ise <b>yönü</b>. <b>Yayıcı</b> aracında noktayı tutup sürükleyerek taşı, başka bir yere basıp sürükleyerek <b>o yöne çevir</b>. <b>Açı</b> barı da yönü çevirir: 0° aşağı, 90° sağ, 180° yukarı." },
    { icon: "💦", title: "Akış ve basınç", text: "<b>Akış</b> ne kadar sıvı çıkacağını belirler: arttıkça akış kalınlaşır. <b>Basınç</b> sıvının ne kadar sert fışkıracağını: yüksek basınçta jet uzağa, hatta yukarı doğru gider." },
    { icon: "🫗", title: "Yoğunluk", text: "Yoğun sıvı aynı renkte ama <b>daha koyu</b> ve daha ağırdır: havada yolundan sapmaz, yerde yavaş yayılır ve hafif sıvının <b>altına çöker</b>. Farklı yoğunlukları art arda dökerek katman oluştur." },
    { icon: "🎨", title: "Renk", text: "<b>Renk</b> kutusundan sıvının rengini seç. Yoğunluk rengi değiştirmez, sadece koyulaştırır." },
    { icon: "🍯", title: "Yerçekimi ve kıvam", text: "<b>Yerçekimi</b> sıvının ne kadar hızlı düştüğünü, <b>Kıvam</b> ise ne kadar yapışkan olduğunu belirler. Kıvam yüksekse sıvı bal gibi yavaş yayılır." },
    { icon: "🧱", title: "Duvarlar", text: "<b>Duvar</b> ile kanal, havuz, rampa çiz; <b>Sil</b> ile bozdur. <b>Boşalt</b> sıvıyı temizler, <b>Sıfırla</b> sahneyi ilk haline getirir." },
  ];

  MG.register({
    id: KEY,
    name: "Water Simulation",
    emoji: "🌊",
    desc: "Sıvı deneyleri: akış, basınç, yoğunluk.",
    guide: GUIDE,
    mount,
    unmount,
    pause,
  });
})();
