(function () {
  const KEY = "presia";

  // Grid and cylinder geometry (in cells).
  const W = 41, H = 92;
  const CX = 20;       // center column; every row is symmetric around it
  const BODY = 4;      // cells on each side of the center column (grows a little with the tip)
  const TOP = 6;       // first row of the cylinder
  const FUNNEL = 46;   // the curved bottom starts here
  const NECK = 57;     // the curve ends in a straight tip here
  const VALVE = 61;    // last tip row; liquid leaves below it
  const PLATE = VALVE + 6; // center row of the two oval plates just under the tip
  const HOLE = 1;      // cells on each side of the center column left open between the plates
  const OVAL_RX = 8, OVAL_RY = 2.5;
  const BOTTOM = H - 8; // last row of the bowl; a small outlet under it lets the liquid drip out
  const BOWL = 10;     // half width of the oval bowl at its widest
  const SHAPE = 4;     // bottom curve follows y ∝ x^SHAPE
  const LIMIT = 16;    // fill line; above it the liquid pushes through the valve
  const STEP = 1 / 60;

  const CFG = {
    flowMin: 0.2,      // cells poured per tick with the flow slider all the way left...
    flowMax: 4,        // ...and all the way right
    flowPress: 0.5,    // more flow pushes harder: pressure rise × (1 + this × slider)
    compress: 0.4,     // density squeezed into the column per absorbed cell
    grain: 0.08,       // density one pixel gains at a time from the squeezed mass
    grains: 3,         // pixels densified per tick, so compression shows up gradually
    mix: 0.04,         // density diffusion between touching cells per tick
    spread: 4,         // max cells a blocked cell slides sideways per tick
    leak: 1,           // chance a cell passes the open valve per try
    visc: 0.85,        // dense liquid is sluggish: chance to skip a move = this × density²
    dripMin: 0.04,     // fully dense liquid still passes the valve this often, drop by drop
    pushVisc: 0.9,     // pressure overcomes sluggishness: viscosity × (1 - this × pressure)
    pushFlow: 1.2,     // pressure forces liquid through the valve: pass chance + this × pressure
    tipSteps: 3,       // tip widens through 1, 3, 5 cells as pressure rises
    tipBurst: 7,       // tip width while bursting
    hyst: 3,           // rows the level must drop before the valve closes again
    rise: 5,           // pressure per second while holding...
    whiteRise: 12,     // ...plus this × whiteness² (whiter = harder)
    fall: 22,          // pressure lost per second when released; until it's gone it keeps pushing liquid out
    dangerAt: 80,
    duration: 60,      // seconds per round
    win: 0.98,         // whiteness that counts as fully white
    timeBonus: 20,     // points per second left when fully white
    burstTime: 1.4,    // seconds the tip sprays before the round ends
    feedMax: 0.6,      // density of the poured liquid with the slider all the way right
    feedPress: 0.6,    // denser pour pushes harder: pressure rise × (1 + this × slider)
  };

  // Open columns [lo, hi) of row y. The bottom curves in like x^SHAPE and ends in a tip `tip` cells wide.
  function span(y, tip) {
    const body = BODY + Math.round((tip - 1) / 4);
    let half = body;
    if (y >= NECK) half = (tip - 1) / 2;
    else if (y >= FUNNEL) half = Math.round(body * Math.pow(1 - (y - FUNNEL) / (NECK - FUNNEL), 1 / SHAPE));
    return [CX - half, CX + half + 1];
  }

  const BG = [26, 29, 38];
  const GLASS = [62, 80, 102];
  const WALL = [220, 195, 166];
  const PINK = [232, 128, 166];
  const PINK_TOP = [250, 178, 204];
  const BOWL_GLASS = [86, 58, 82];
  const OPEN = new Uint8Array(W * H);
  const BASE = new Uint8ClampedArray(W * H * 4);

  function inOval(x, y) {
    const dx = (Math.abs(x - CX) - (HOLE + 0.5 + OVAL_RX)) / OVAL_RX;
    const dy = (y - PLATE) / OVAL_RY;
    return dx * dx + dy * dy <= 1;
  }

  // Below the tip: air above the plates, then the bowl under the hole between them.
  function openBelow(x, y) {
    if (inOval(x, y)) return false;
    const off = Math.abs(x - CX);
    if (y < PLATE) return off <= HOLE + 2 * OVAL_RX;
    if (y > BOTTOM) return off === 0;
    const t = (y - PLATE) / (BOTTOM - PLATE);
    return off <= HOLE + (BOWL - HOLE) * 2 * Math.sqrt(t * (1 - t));
  }

  function build(tip) {
    OPEN.fill(0);
    BASE.fill(0);
    for (let y = 0; y < H; y++) {
      if (y > VALVE) {
        for (let x = 0; x < W; x++) OPEN[y * W + x] = openBelow(x, y) ? 1 : 0;
        continue;
      }
      const [lo, hi] = span(y, tip);
      for (let x = lo; x < hi; x++) OPEN[y * W + x] = 1;
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        let c = BG;
        if (y > VALVE && inOval(x, y)) {
          c = inOval(x, y - 1) ? PINK : PINK_TOP;
        } else if (OPEN[i]) {
          if (y >= TOP && y <= VALVE) c = GLASS;
          else if (y >= PLATE && y <= BOTTOM + 2) c = BOWL_GLASS;
        } else if (y >= PLATE && y <= BOTTOM + 2 && Math.abs(x - CX) <= HOLE + 2 * OVAL_RX) {
          c = PINK;
        } else {
          for (let dy = -1; dy <= 1 && c === BG; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              const glass = (ny >= TOP && ny <= VALVE) || (ny >= PLATE && ny <= BOTTOM + 2);
              if (nx >= 0 && nx < W && glass && OPEN[ny * W + nx]) { c = ny > VALVE ? PINK : WALL; break; }
            }
          }
        }
        BASE[o] = c[0]; BASE[o + 1] = c[1]; BASE[o + 2] = c[2]; BASE[o + 3] = 255;
      }
    }
  }

  function tipWidth() {
    if (state.burst) return CFG.tipBurst;
    return 1 + 2 * Math.min(CFG.tipSteps - 1, Math.floor((state.pressure / 100) * CFG.tipSteps));
  }

  function reshape(tip) {
    const s = state, before = OPEN.slice();
    s.tip = tip;
    build(tip);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (s.liq[i] && !OPEN[i]) {
          s.liq[i] = 0;
          s.dens[i] = 0;
        } else if (OPEN[i] && !before[i] && y >= s.surface && y <= VALVE) {
          // The walls stretch outward under the liquid, so the level stays put.
          const j = i + (x < CX ? 1 : -1);
          s.liq[i] = 1;
          s.dens[i] = s.liq[j] ? s.dens[j] : 0;
        }
      }
    }
  }

  let ctx, root, els, raf, state, onKey, onKeyUp, onVis, buf, bctx, img, cs = 1;
  const onResize = () => resize();

  function template() {
    return `
      <div class="weita">
        <div class="weita-hud">
          <span class="pill">Puan: <b data-el="score">0</b></span>
          <span class="pill">Süre: <b data-el="time">0</b>s</span>
          <span class="pill">En iyi: <b data-el="best">0</b></span>
          <button class="pill pill-btn" data-el="pauseBtn">⏸ Durdur</button>
        </div>
        <div class="weita-stage">
          <div class="col">
            <span class="col-label">Beyaz</span>
            <div class="meter white" data-el="whiteMeter"><div class="fill" data-el="white"></div></div>
          </div>
          <div class="col">
            <span class="col-label">Tut</span>
            <div class="presia-box" data-el="box"><canvas data-el="canvas"></canvas></div>
          </div>
          <div class="col">
            <span class="col-label">Basınç</span>
            <div class="meter orange" data-el="pressMeter"><div class="fill" data-el="press"></div></div>
          </div>
        </div>
        <div class="presia-controls">
          <label class="presia-feed">
            <span class="col-label">Akış</span>
            <input type="range" min="0" max="100" value="30" data-el="flow" aria-label="Akan sıvının miktarı">
          </label>
          <label class="presia-feed">
            <span class="col-label">Yoğunluk</span>
            <input type="range" min="0" max="100" value="0" data-el="feed" aria-label="Akan sıvının yoğunluğu">
          </label>
        </div>
        <p class="weita-hint">Çizgiye gelince basılı tut. Barları sağa çektikçe beyaz hızlanır ama basınç da hızlanır.</p>
        <div class="weita-toast" data-el="toast"></div>
        <div class="overlay" data-el="overlay"></div>
      </div>`;
  }

  function best() { return ctx.storage.get(KEY + ":best", 0); }

  function showOverlay(html) {
    els.overlay.innerHTML = `<div class="panel">${html}</div>`;
    els.overlay.classList.remove("hidden");
  }

  function overlayOpen() { return !els.overlay.classList.contains("hidden"); }

  function showIntro() {
    showOverlay(`
      <h3>Presia</h3>
      <p>Silindiri doldur, alt ucu basılı tutarak kapat, sıvıyı saydamdan bembeyaza kadar sıkıştır.</p>
      <div class="actions">
        <button class="btn" data-act="play">Başla</button>
        <button class="btn ghost" data-act="guide">Nasıl oynanır?</button>
      </div>`);
  }

  function showPause() {
    showOverlay(`
      <h3>Mola ☕</h3>
      <p>Hazır olduğunda devam et.</p>
      <div class="actions">
        <button class="btn" data-act="resume">Devam</button>
        <button class="btn ghost" data-act="exit">Menü</button>
      </div>`);
  }

  function showEnd(title, score, isBest, note) {
    showOverlay(`
      <h3>${title}</h3>
      <div class="score">${score}</div>
      <div class="sub">${isBest ? "Yeni rekor!" : "En iyi: " + best()}</div>
      <p>${note}</p>
      <div class="actions">
        <button class="btn" data-act="play">Tekrar</button>
        <button class="btn ghost" data-act="exit">Menü</button>
      </div>`);
  }

  function reset() {
    cancelAnimationFrame(raf);
    build(1);
    state = {
      playing: false,
      paused: false,
      tip: 1,
      liq: new Uint8Array(W * H),
      dens: new Float32Array(W * H),
      moved: new Uint32Array(W * H),
      tick: 0,
      acc: 0,
      gate: "closed",   // closed: below the line, open: draining, held: blocked by the player, burst: spraying
      burst: null,
      drops: [],
      holding: false,
      pointer: null,
      boost: 0,
      feed: els.feed.value / 100,
      flow: els.flow.value / 100,
      pour: 0,
      surface: FUNNEL,
      count: 0,
      white: 0,
      pressure: 0,
      time: 0,
      last: 0,
    };
    measure();
    render();
  }

  function play() {
    reset();
    state.playing = true;
    els.overlay.classList.add("hidden");
    state.last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (!state.playing || state.paused) return;
    state.paused = true;
    state.holding = false;
    state.pointer = null;
    cancelAnimationFrame(raf);
    showPause();
  }

  function resume() {
    if (!state.paused) return;
    state.paused = false;
    els.overlay.classList.add("hidden");
    state.last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function finish(kind) {
    state.playing = false;
    state.holding = false;
    cancelAnimationFrame(raf);
    const white = state.burst ? state.burst.white : state.white;
    const pct = Math.floor(white * 1000);
    let score = pct, title, note;
    if (kind === "win") {
      score = 1000 + Math.max(0, Math.round((CFG.duration - state.time) * CFG.timeBonus));
      title = "Bembeyaz! ✨";
      note = "Sıvıyı tamamen beyazlattın, kalan süre bonus oldu.";
    } else if (kind === "burst") {
      score = Math.floor(pct / 2);
      title = "Patladı! 💥";
      note = "Basınç tepeye vurdu, puanın yarıya indi.";
    } else {
      title = "Süre doldu ⏳";
      note = `Sıvı %${Math.floor(white * 100)} beyazlığa ulaştı.`;
    }
    const isBest = score > best();
    if (isBest) ctx.storage.set(KEY + ":best", score);
    render(score);
    showEnd(title, score, isBest, note);
  }

  // Can a cell of density v at row `from` move into (x, y)? Dense liquid squeezes through the open valve only drop by drop.
  function free(x, y, v, from) {
    if (x < 0 || x >= W || y >= H) return false;
    const i = y * W + x;
    if (!OPEN[i] || state.liq[i]) return false;
    if (from !== VALVE || y !== VALVE + 1) return true;
    if (state.gate === "burst") return true;
    const ease = Math.max(CFG.dripMin, (1 - v) * (1 - v)) + (state.pressure / 100) * CFG.pushFlow;
    return state.gate === "open" && Math.random() < CFG.leak * ease;
  }

  function slide(i, x, y, dir) {
    let nx = x;
    for (let n = 0; n < CFG.spread && free(nx + dir, y, state.dens[i], y); n++) nx += dir;
    if (nx === x) return false;
    move(i, i + nx - x);
    return true;
  }

  function move(i, j) {
    const s = state;
    s.liq[j] = 1;
    s.dens[j] = s.dens[i];
    s.liq[i] = 0;
    s.dens[i] = 0;
    s.moved[j] = s.tick;
  }

  function step() {
    const s = state, liq = s.liq, d = s.dens;
    // Once the liquid has pushed on the tip, small dips in the level don't let go of it.
    const reached = s.surface <= LIMIT + (s.gate === "closed" ? 0 : CFG.hyst);
    if (s.burst) s.gate = "burst";
    else if (s.holding) s.gate = reached ? "held" : "closed";
    // Released: stored pressure keeps pushing liquid out even below the line.
    else s.gate = reached || s.pressure > 0 ? "open" : "closed";
    s.tick++;

    s.pour += CFG.flowMin + (CFG.flowMax - CFG.flowMin) * s.flow;
    for (const x of [CX, CX - 1, CX + 1, CX - 2, CX + 2]) {
      if (s.pour < 1) break;
      if (!liq[x]) { liq[x] = 1; d[x] = s.feed * CFG.feedMax; s.pour -= 1; }
    }
    s.pour = Math.min(s.pour, 1);

    const flip = s.tick & 1;
    const push = s.burst ? 1 : s.pressure / 100;
    const visc = CFG.visc * Math.max(0, 1 - CFG.pushVisc * push);
    for (let y = H - 1; y >= 0; y--) {
      for (let k = 0; k < W; k++) {
        const x = flip ? k : W - 1 - k;
        const i = y * W + x;
        if (!liq[i] || s.moved[i] === s.tick) continue;
        if (y === H - 1) { liq[i] = 0; d[i] = 0; continue; }
        const v = d[i];
        if (Math.random() < visc * v * v) continue;
        if (free(x, y + 1, v, y)) { move(i, i + W); continue; }
        // Blocked valve: liquid landing above the line gets squeezed into the column.
        if (s.gate === "held" && y >= TOP && y < LIMIT) {
          s.boost += CFG.compress * (1 + d[i]);
          liq[i] = 0;
          d[i] = 0;
          continue;
        }
        const dir = Math.random() < 0.5 ? 1 : -1;
        if (free(x + dir, y + 1, v, y)) move(i, i + W + dir);
        else if (free(x - dir, y + 1, v, y)) move(i, i + W - dir);
        else if (!slide(i, x, y, dir)) slide(i, x, y, -dir);
      }
    }

    for (let y = TOP; y <= VALVE; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = y * W + x;
        if (!liq[i]) continue;
        if (liq[i + 1]) { const m = (d[i] - d[i + 1]) * CFG.mix; d[i] -= m; d[i + 1] += m; }
        if (liq[i + W]) { const m = (d[i] - d[i + W]) * CFG.mix; d[i] -= m; d[i + W] += m; }
      }
    }

    // Squeezed mass settles into random pixels a little at a time.
    for (let n = 0; n < CFG.grains && s.boost >= CFG.grain; n++) {
      for (let tries = 0; tries < 6; tries++) {
        const i = LIMIT * W + Math.floor(Math.random() * (VALVE + 1 - LIMIT) * W);
        if (liq[i] && d[i] < 1) { d[i] = Math.min(1, d[i] + CFG.grain); s.boost -= CFG.grain; break; }
      }
    }

    measure();
  }

  // Liquid level (topmost mostly-full row) and average whiteness below the line.
  function measure() {
    const s = state;
    let surface = FUNNEL;
    for (let y = FUNNEL - 1; y >= TOP; y--) {
      const [lo, hi] = span(y, s.tip);
      let n = 0;
      for (let x = lo; x < hi; x++) n += s.liq[y * W + x];
      if (n < (hi - lo) * 0.6) break;
      surface = y;
    }
    let sum = 0, count = 0;
    for (let i = LIMIT * W; i < (VALVE + 1) * W; i++) {
      if (s.liq[i]) { sum += s.dens[i]; count++; }
    }
    s.surface = surface;
    s.count = count;
    s.white = count ? sum / count : 0;
  }

  function loop(now) {
    if (!state.playing || state.paused) return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    if (!state.burst) state.time += dt;

    state.acc += dt;
    let n = 0;
    while (state.acc >= STEP && n < 4) { step(); state.acc -= STEP; n++; }
    if (n === 4) state.acc = 0;
    spray(dt);

    if (state.burst) {
      state.burst.t += dt;
      if (state.burst.t >= CFG.burstTime) return finish("burst");
    } else {
      const w = state.white;
      if (state.gate === "held") state.pressure += (CFG.rise + CFG.whiteRise * w * w) * (1 + CFG.feedPress * state.feed) * (1 + CFG.flowPress * state.flow) * dt;
      else state.pressure = Math.max(0, state.pressure - CFG.fall * dt);

      if (state.pressure >= 100) startBurst();
      else if (state.white >= CFG.win) return finish("win");
      else if (state.time >= CFG.duration) { state.time = CFG.duration; return finish("time"); }
    }

    const tip = tipWidth();
    if (tip !== state.tip) reshape(tip);
    render();
    raf = requestAnimationFrame(loop);
  }

  function startBurst() {
    state.pressure = 100;
    state.burst = { t: 0, white: state.white };
    state.holding = false;
    state.pointer = null;
  }

  // Droplets spraying out of the tip while bursting (in cell units).
  function spray(dt) {
    const s = state;
    if (s.burst) {
      const power = Math.max(0, 1 - s.burst.t / CFG.burstTime);
      const count = Math.round(160 * power * dt + Math.random());
      for (let n = 0; n < count; n++) {
        s.drops.push({
          x: CX + 0.5 + (Math.random() - 0.5) * s.tip,
          y: VALVE + 1,
          vx: (Math.random() - 0.5) * 30 * (0.4 + power),
          vy: -8 + Math.random() * 40 * (0.5 + power),
          life: 0.5 + Math.random() * 0.5,
          d: s.burst.white,
        });
      }
    }
    s.drops = s.drops.filter((p) => {
      p.vy += 45 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0;
    });
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

  function draw() {
    const s = state, px = img.data;
    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      if (!s.liq[i]) {
        px[o] = BASE[o]; px[o + 1] = BASE[o + 1]; px[o + 2] = BASE[o + 2]; px[o + 3] = BASE[o + 3];
        continue;
      }
      // Watery blue when clear, turning milk white fast as it thickens.
      const v = 1 - (1 - s.dens[i]) * (1 - s.dens[i]), a = 0.35 + 0.65 * Math.sqrt(v);
      const r = 170 + 85 * v, g = 200 + 55 * v, b = 230 + 22 * v;
      if (BASE[o + 3]) {
        px[o] = BASE[o] * (1 - a) + r * a;
        px[o + 1] = BASE[o + 1] * (1 - a) + g * a;
        px[o + 2] = BASE[o + 2] * (1 - a) + b * a;
        px[o + 3] = 255;
      } else {
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a * 255;
      }
    }
    bctx.putImageData(img, 0, 0);

    const c = els.canvas.getContext("2d");
    c.clearRect(0, 0, els.canvas.width, els.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(buf, 0, 0, W * cs, H * cs);

    c.save();
    c.strokeStyle = s.surface <= LIMIT ? "#e0533a" : "rgba(224, 83, 58, .5)";
    c.lineWidth = Math.max(2, cs * 0.35);
    c.setLineDash([cs, cs * 0.7]);
    c.beginPath();
    const [lineLo, lineHi] = span(LIMIT, s.tip);
    c.moveTo(lineLo * cs, LIMIT * cs);
    c.lineTo(lineHi * cs, LIMIT * cs);
    c.stroke();
    c.restore();

    if (s.holding) {
      c.save();
      c.fillStyle = "#f28c38";
      if (s.gate === "held") { c.shadowColor = "rgba(242, 140, 56, .8)"; c.shadowBlur = cs * 2; }
      c.beginPath();
      const [lo, hi] = span(VALVE, s.tip);
      const args = [(lo - 1) * cs, (VALVE + 1) * cs, (hi - lo + 2) * cs, cs * 2.5];
      if (c.roundRect) c.roundRect(...args, cs); else c.rect(...args);
      c.fill();
      c.restore();
    }

    for (const p of s.drops) {
      c.fillStyle = `rgba(255, 255, 255, ${Math.min(1, p.life * 2) * (0.5 + 0.5 * p.d)})`;
      c.beginPath();
      c.arc(p.x * cs, p.y * cs, cs * 0.55, 0, Math.PI * 2);
      c.fill();
    }
  }

  function render(finalScore) {
    draw();
    els.white.style.height = state.white * 100 + "%";
    els.press.style.height = state.pressure + "%";
    const danger = state.pressure >= CFG.dangerAt;
    els.pressMeter.classList.toggle("danger", danger);
    els.box.classList.toggle("danger", danger);
    els.whiteMeter.classList.toggle("filling", state.gate === "held");
    els.score.textContent = finalScore !== undefined ? finalScore : Math.floor(state.white * 1000);
    els.time.textContent = Math.ceil(CFG.duration - state.time);
    els.best.textContent = best();
  }

  function mount(container, context) {
    ctx = context;
    root = container;
    root.innerHTML = template();
    els = {};
    root.querySelectorAll("[data-el]").forEach((n) => { els[n.dataset.el] = n; });

    buf = document.createElement("canvas");
    buf.width = W;
    buf.height = H;
    bctx = buf.getContext("2d");
    img = bctx.createImageData(W, H);

    els.box.addEventListener("pointerdown", (e) => {
      if (!state.playing || state.paused || state.burst) return;
      els.box.setPointerCapture(e.pointerId);
      state.pointer = e.pointerId;
      state.holding = true;
      e.preventDefault();
    });
    const onUp = (e) => {
      if (state.pointer !== e.pointerId) return;
      state.pointer = null;
      state.holding = false;
    };
    els.box.addEventListener("pointerup", onUp);
    els.box.addEventListener("pointercancel", onUp);
    els.box.addEventListener("contextmenu", (e) => e.preventDefault());
    els.feed.addEventListener("input", () => { state.feed = els.feed.value / 100; });
    els.flow.addEventListener("input", () => { state.flow = els.flow.value / 100; });
    els.pauseBtn.addEventListener("click", pause);

    els.overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "play") play();
      if (act === "resume") resume();
      if (act === "guide") ctx.openGuide();
      if (act === "exit") ctx.exit();
    });

    onKey = (e) => {
      if (ctx.guideOpen()) return;
      const k = e.key.toLowerCase();
      const confirm = k === " " || k === "enter";
      if (confirm && state.playing && !state.paused) state.holding = !state.burst;
      else if (confirm && state.paused) resume();
      else if (confirm && !state.playing && overlayOpen()) play();
      else if ((k === "arrowleft" || k === "arrowright") && e.target !== els.feed) {
        els.feed.value = +els.feed.value + (k === "arrowright" ? 5 : -5);
        state.feed = els.feed.value / 100;
      }
      else if ((k === "arrowup" || k === "arrowdown") && e.target !== els.flow) {
        els.flow.value = +els.flow.value + (k === "arrowup" ? 5 : -5);
        state.flow = els.flow.value / 100;
      }
      else if (k === "escape" || k === "p") pause();
      else return;
      e.preventDefault();
    };
    onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if ((k === " " || k === "enter") && state.pointer === null) state.holding = false;
    };
    onVis = () => { if (document.hidden) pause(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    reset();
    requestAnimationFrame(() => resize());
    showIntro();
  }

  function unmount() {
    cancelAnimationFrame(raf);
    if (state) state.playing = false;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
  }

  const GUIDE = [
    { icon: "🧪", title: "Amaç", text: "Silindirdeki sıvıyı <b>saydamdan bembeyaza</b> kadar yoğunlaştır. Sıvı ne kadar beyazsa puanın o kadar yüksek." },
    { icon: "💧", title: "Akış", text: "Sıvı yukarıdan sürekli akar. <b>Kırmızı çizgiye</b> kadar dolunca alttaki ince uçtan boşalmaya başlar." },
    { icon: "✋", title: "Tut", text: "Silindire basılı tutarak alt ucu kapat. PC'de <b>Boşluk</b> tuşu da olur. Üstten gelen sıvı sıkışır ve silindirdeki sıvı <b>yoğunlaşır</b>." },
    { icon: "💥", title: "Basınç", text: "Tuttuğun sürece basınç yükselir, sıvı beyazladıkça daha da hızlı yükselir. Basınç tepeye vurursa <b>patlar</b> ve puanın yarıya iner." },
    { icon: "🚰", title: "Akış", text: "<b>Akış</b> barını sağa çektikçe yukarıdan daha çok sıvı akar: silindir hızlı dolar, sıkıştırdığında beyaz hızlı artar. Ama basınç da hızlanır, bırakınca da sıvı taşabilir. PC'de <b>↑ ↓</b> tuşları da olur." },
    { icon: "🎚️", title: "Yoğunluk", text: "Alttaki barı <b>sağa</b> çektikçe yukarıdan akan sıvı daha yoğun gelir ve beyaz daha hızlı artar. Ama yoğun sıvı daha sert iter: <b>basınç</b> da o kadar hızlı yükselir. PC'de <b>← →</b> tuşları da olur." },
    { icon: "🌊", title: "Bırak", text: "Bırakınca biriken basınç sıvıyı uçtan dışarı <b>iter</b> ve basınç bitene kadar silindir boşalır, yerine saydam sıvı gelir. Basınç yüksekse yoğun sıvı bile hızla fışkırır. Basınç azaldıkça yoğun sıvı ağırlaşır, <b>damla damla</b>, tortu gibi süzülür." },
    { icon: "🏆", title: "Puan", text: "Tur <b>60 saniye</b>. Süre bitince beyazlık kadar puan alırsın (en fazla 1000). Bembeyaza ulaşırsan kalan süre kadar bonus kazanırsın." },
  ];

  MG.register({
    id: KEY,
    name: "Presia",
    emoji: "🧪",
    desc: "Sıvıyı tut, sıkıştır, bembeyaz yap.",
    guide: GUIDE,
    mount,
    unmount,
    pause,
  });
})();
