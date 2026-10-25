(function () {
  const KEY = "aeya";
  const SIZE = 5;
  const DIGS = 3;

  // Ore tiers, ordered from easiest to hardest task.
  const ORES = [
    { id: "bronze", name: "Bronz", count: 5, points: 100 },
    { id: "silver", name: "Gümüş", count: 2, points: 250 },
    { id: "gold", name: "Altın", count: 1, points: 600 },
  ];

  // Task difficulty per tier: [bronze, silver, gold].
  const TASKS = {
    hold: { name: "Bas-tut", fill: [1.6, 1.15, 0.8], window: [24, 15, 9] },
    slide: { name: "Kaydır", zone: [0.36, 0.26, 0.18], speed: [0.5, 0.8, 1.15], need: [2.5, 3, 3.5], time: 8, keySpeed: 1.4 },
    tap: { name: "Vur", taps: [12, 18, 24], time: 4 },
    stop: { name: "Durdur", speed: [0.8, 1.25, 1.8], window: [20, 13, 8] },
    memory: { name: "Hafıza", length: [3, 4, 5], step: [0.75, 0.6, 0.45] },
    catch: { name: "Yakala", need: [5, 7, 9], size: [60, 46, 36], life: [1.5, 1.1, 0.8], time: 8 },
  };
  const TYPES = Object.keys(TASKS);
  const WAIT = 0.7; // seconds before a timed task starts counting

  let ctx, root, els, raf, timer, state, onKey, onKeyUp, onVis;
  const onResize = () => { if (state && state.task) renderTask(); };

  function template() {
    return `
      <div class="aeya">
        <div class="weita-hud">
          <span class="pill">Puan: <b data-el="score">0</b></span>
          <span class="pill">Kazı: <b data-el="digs">${DIGS}</b></span>
          <span class="pill">En iyi: <b data-el="best">0</b></span>
        </div>
        <div class="aeya-field"><div class="aeya-grid" data-el="grid"></div></div>
        <p class="weita-hint" data-el="hint"></p>
        <div class="aeya-task hidden" data-el="task"></div>
        <div class="weita-toast" data-el="toast"></div>
        <div class="overlay" data-el="overlay"></div>
      </div>`;
  }

  function best() { return ctx.storage.get(KEY + ":best", 0); }

  function clamp(v) { return Math.min(1, Math.max(0, v)); }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showOverlay(html) {
    els.overlay.innerHTML = `<div class="panel">${html}</div>`;
    els.overlay.classList.remove("hidden");
  }

  function overlayOpen() { return !els.overlay.classList.contains("hidden"); }

  function showIntro() {
    showOverlay(`
      <h3>Aeya</h3>
      <p>Tarlada gizli madenler var. 3 kazı hakkınla doğru kareleri bul, görevleri tamamla.</p>
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

  function showEnd(score, isBest, found) {
    showOverlay(`
      <h3>${found === DIGS ? "Hazine avcısı! ✨" : "Kazı bitti ⛏️"}</h3>
      <div class="score">${score}</div>
      <div class="sub">${isBest ? "Yeni rekor!" : "En iyi: " + best()}</div>
      <p>${DIGS} kazıdan ${found} maden çıkardın.</p>
      <div class="actions">
        <button class="btn" data-act="play">Tekrar</button>
        <button class="btn ghost" data-act="exit">Menü</button>
      </div>`);
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.remove("show");
    void els.toast.offsetWidth;
    els.toast.classList.add("show");
  }

  function reset() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    const cells = Array.from({ length: SIZE * SIZE }, () => ({ ore: -1, dug: false, result: "" }));
    const free = shuffle(cells.map((_, i) => i));
    ORES.forEach((o, tier) => { for (let n = 0; n < o.count; n++) cells[free.pop()].ore = tier; });
    state = {
      playing: false,
      paused: false,
      phase: "dig",
      cells,
      digs: DIGS,
      points: 0,
      task: null,
      last: 0,
      drag: null,
      keyDir: 0,
    };
    els.task.classList.add("hidden");
    renderField();
    render();
  }

  function play() {
    reset();
    state.playing = true;
    els.overlay.classList.add("hidden");
  }

  function pause() {
    if (!state.playing || state.paused) return;
    state.paused = true;
    if (state.task) state.task.holding = false;
    state.drag = null;
    state.keyDir = 0;
    cancelAnimationFrame(raf);
    showPause();
  }

  function resume() {
    if (!state.paused) return;
    state.paused = false;
    els.overlay.classList.add("hidden");
    if (state.phase === "task") {
      state.last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  // Number of ores in the 8 surrounding cells.
  function neighbors(i) {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE && state.cells[ny * SIZE + nx].ore >= 0) n++;
      }
    }
    return n;
  }

  function dig(i) {
    if (!state.playing || state.paused || state.phase !== "dig") return;
    const c = state.cells[i];
    if (c.dug) return;
    c.dug = true;
    state.digs--;
    renderField();
    render();
    if (c.ore >= 0) return startTask(i);
    const n = neighbors(i);
    toast(n ? `Boş · çevrede ${n} maden` : "Boş · çevre de boş");
    afterDig();
  }

  function afterDig() {
    if (state.digs > 0) { state.phase = "dig"; render(); return; }
    finish();
  }

  function finish() {
    state.playing = false;
    state.phase = "end";
    const score = state.points;
    const found = state.cells.filter((c) => c.result === "ok").length;
    const isBest = score > best();
    if (isBest) ctx.storage.set(KEY + ":best", score);
    renderField();
    render();
    timer = setTimeout(() => showEnd(score, isBest, found), 1100);
  }

  function zoneCenter(t) {
    const wave = 0.65 * Math.sin(t.phase * 2.1) + 0.35 * Math.sin(t.phase * 3.7 + 1.3);
    return 0.5 + (0.5 - t.size / 2) * wave;
  }

  function inZone(t) { return Math.abs(t.pos - t.center) <= t.size / 2; }

  function startTask(i) {
    const tier = state.cells[i].ore;
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const T = TASKS[type];
    const t = { type, tier, cell: i, wait: WAIT };
    if (type === "hold") {
      const w = T.window[tier];
      t.wait = 0;
      t.fill = 0;
      t.holding = false;
      t.rate = 100 / T.fill[tier];
      t.lo = 40 + Math.random() * (52 - w);
      t.hi = t.lo + w;
    } else if (type === "slide") {
      t.pos = 0.5;
      t.size = T.zone[tier];
      t.speed = T.speed[tier];
      t.need = T.need[tier];
      t.phase = Math.random() * 10;
      t.center = zoneCenter(t);
      t.progress = 0;
      t.time = T.time;
    } else if (type === "tap") {
      t.count = 0;
      t.need = T.taps[tier];
      t.time = T.time;
    } else if (type === "stop") {
      const w = T.window[tier];
      t.pos = 0;
      t.dir = 1;
      t.rate = T.speed[tier] * 100;
      t.lo = 25 + Math.random() * (65 - w);
      t.hi = t.lo + w;
    } else if (type === "memory") {
      t.seq = Array.from({ length: T.length[tier] }, () => Math.floor(Math.random() * 4));
      t.step = T.step[tier];
      t.clock = 0;
      t.input = -1;
      t.flash = null;
    } else {
      t.count = 0;
      t.need = T.need[tier];
      t.time = T.time;
      t.size = T.size[tier];
      t.lifeMax = T.life[tier];
      moveTarget(t);
    }
    state.task = t;
    state.phase = "task";
    showTask();
    state.last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function showTask() {
    const t = state.task, ore = ORES[t.tier];
    const head = `<span class="ore-badge ${ore.id}"><span class="ore ${ore.id}"></span>${ore.name} · ${TASKS[t.type].name}</span>`;
    let body;
    if (t.type === "hold") {
      body = `
        <p>Butona basılı tut, bar yeşil alana gelince bırak.</p>
        <div class="aeya-bar"><div class="win" style="left:${t.lo}%;width:${t.hi - t.lo}%"></div><div class="aeya-fill" data-t="fill"></div></div>
        <button class="tut-btn" data-act="hold">BAS</button>`;
    } else if (t.type === "slide") {
      body = `
        <p>Topu sürükle, hareket eden alanın içinde tut.</p>
        <div class="aeya-slide" data-t="track"><div class="zone" data-t="zone"></div><div class="knob" data-t="knob"></div></div>
        <div class="aeya-bar"><div class="aeya-fill" data-t="fill"></div></div>
        <div class="tut-time" data-t="time"></div>`;
    } else if (t.type === "tap") {
      body = `
        <p>Süre bitmeden butona durmadan bas!</p>
        <div class="aeya-bar"><div class="aeya-fill" data-t="fill"></div></div>
        <div class="tut-time" data-t="time"></div>
        <button class="tut-btn" data-act="tap">VUR</button>`;
    } else if (t.type === "stop") {
      body = `
        <p>İbre gidip geliyor. Yeşil alandayken bas!</p>
        <div class="aeya-bar"><div class="win" style="left:${t.lo}%;width:${t.hi - t.lo}%"></div><div class="needle" data-t="needle"></div></div>
        <div class="tut-time" data-t="time"></div>
        <button class="tut-btn" data-act="stop">DUR</button>`;
    } else if (t.type === "memory") {
      body = `
        <p>Yanan sırayı izle, sonra aynı sırayla bas.</p>
        <div class="aeya-pads">${[0, 1, 2, 3].map((i) => `<button class="pad p${i}" data-act="pad" data-pad="${i}">${i + 1}</button>`).join("")}</div>
        <div class="tut-time" data-t="time"></div>`;
    } else {
      body = `
        <p>Beliren madeni kaçmadan yakala!</p>
        <div class="aeya-area"><button class="aeya-target ore ${ore.id}" data-act="hit" data-t="target" aria-label="Yakala"></button></div>
        <div class="aeya-bar"><div class="aeya-fill" data-t="fill"></div></div>
        <div class="tut-time" data-t="time"></div>`;
    }
    els.task.innerHTML = `<div class="panel">${head}${body}</div>`;
    els.t = { pads: els.task.querySelectorAll(".pad") };
    els.task.querySelectorAll("[data-t]").forEach((n) => { els.t[n.dataset.t] = n; });
    els.task.classList.remove("hidden");
    renderTask();
  }

  function renderTask() {
    const t = state.task, e = els.t;
    if (t.type === "hold") {
      e.fill.style.width = t.fill + "%";
      return;
    }
    if (t.wait > 0) e.time.textContent = "Hazır…";
    else if (t.type === "stop") e.time.textContent = "";
    else if (t.type === "memory") e.time.textContent = t.input < 0 ? "İzle…" : `Sıra sende · ${t.input}/${t.seq.length}`;
    else e.time.textContent = Math.max(0, t.time).toFixed(1) + "s";

    if (t.type === "stop") {
      e.needle.style.left = t.pos + "%";
    } else if (t.type === "memory") {
      const lit = litPad(t);
      e.pads.forEach((p, i) => p.classList.toggle("lit", i === lit));
    } else if (t.type === "catch") {
      const s = e.target.style;
      s.width = s.height = t.size + "px";
      s.left = `calc(${t.x * 100}% - ${t.x * t.size}px)`;
      s.top = `calc(${t.y * 100}% - ${t.y * t.size}px)`;
      s.opacity = 0.35 + 0.65 * (t.life / t.lifeMax);
      e.fill.style.width = Math.min(100, (t.count / t.need) * 100) + "%";
    } else if (t.type === "slide") {
      const k = e.knob.offsetHeight || 0;
      const r = Math.max(0, e.track.clientHeight - k);
      e.knob.style.top = k / 2 + t.pos * r + "px";
      e.zone.style.top = k / 2 + (t.center - t.size / 2) * r + "px";
      e.zone.style.height = t.size * r + "px";
      e.zone.classList.toggle("in", inZone(t));
      e.fill.style.width = Math.min(100, (t.progress / t.need) * 100) + "%";
    } else {
      e.fill.style.width = Math.min(100, (t.count / t.need) * 100) + "%";
    }
  }

  function loop(now) {
    if (!state.playing || state.paused || state.phase !== "task") return;
    const dt = Math.min(0.05, (now - state.last) / 1000);
    state.last = now;
    const t = state.task;

    if (t.type === "hold") {
      if (t.holding) {
        t.fill += t.rate * dt;
        if (t.fill >= 100) { t.fill = 100; renderTask(); return endTask(false, "Fazla tuttun!"); }
      }
    } else if (t.wait > 0) {
      t.wait -= dt;
    } else if (t.type === "stop") {
      t.pos += t.dir * t.rate * dt;
      if (t.pos >= 100) { t.pos = 100; t.dir = -1; }
      else if (t.pos <= 0) { t.pos = 0; t.dir = 1; }
    } else if (t.type === "memory") {
      if (t.input < 0) {
        t.clock += dt;
        if (t.clock >= t.seq.length * t.step) t.input = 0;
      } else if (t.flash) {
        t.flash.time -= dt;
      }
    } else {
      t.time -= dt;
      if (t.type === "catch") {
        t.life -= dt;
        if (t.life <= 0) moveTarget(t);
      }
      if (t.type === "slide") {
        if (state.keyDir) t.pos = clamp(t.pos + state.keyDir * TASKS.slide.keySpeed * dt);
        t.phase += t.speed * dt;
        t.center = zoneCenter(t);
        if (inZone(t)) t.progress += dt;
        if (t.progress >= t.need) return endTask(true);
      }
      if (t.time <= 0) { t.time = 0; renderTask(); return endTask(false, "Süre doldu!"); }
    }

    renderTask();
    raf = requestAnimationFrame(loop);
  }

  function press() {
    const t = state.task;
    if (!t || t.type !== "hold" || state.paused) return;
    t.holding = true;
  }

  function release() {
    const t = state.task;
    if (!t || t.type !== "hold" || !t.holding) return;
    t.holding = false;
    if (t.fill >= t.lo && t.fill <= t.hi) endTask(true);
    else endTask(false, t.fill < t.lo ? "Erken bıraktın!" : "Geç bıraktın!");
  }

  function tap() {
    const t = state.task;
    if (!t || t.type !== "tap" || state.paused || t.wait > 0) return;
    t.count++;
    if (t.count >= t.need) return endTask(true);
    renderTask();
  }

  function stopNeedle() {
    const t = state.task;
    if (!t || t.type !== "stop" || state.paused || t.wait > 0) return;
    if (t.pos >= t.lo && t.pos <= t.hi) endTask(true);
    else endTask(false, "Kaçırdın!");
  }

  // Pad shown as lit: the sequence while watching, the last press while answering.
  function litPad(t) {
    if (t.wait > 0) return -1;
    if (t.input < 0) {
      const idx = Math.floor(t.clock / t.step);
      return idx < t.seq.length && t.clock % t.step < t.step * 0.7 ? t.seq[idx] : -1;
    }
    return t.flash && t.flash.time > 0 ? t.flash.pad : -1;
  }

  function pad(i) {
    const t = state.task;
    if (!t || t.type !== "memory" || state.paused || t.input < 0) return;
    if (t.seq[t.input] !== i) return endTask(false, "Yanlış sıra!");
    t.input++;
    t.flash = { pad: i, time: 0.2 };
    if (t.input >= t.seq.length) return endTask(true);
    renderTask();
  }

  function moveTarget(t) {
    t.x = Math.random();
    t.y = Math.random();
    t.life = t.lifeMax;
  }

  function hit() {
    const t = state.task;
    if (!t || t.type !== "catch" || state.paused || t.wait > 0) return;
    t.count++;
    if (t.count >= t.need) return endTask(true);
    moveTarget(t);
    renderTask();
  }

  function endTask(ok, why) {
    cancelAnimationFrame(raf);
    const t = state.task, ore = ORES[t.tier];
    state.cells[t.cell].result = ok ? "ok" : "fail";
    if (ok) state.points += ore.points;
    state.task = null;
    state.drag = null;
    state.keyDir = 0;
    els.task.classList.add("hidden");
    toast(ok ? `+${ore.points} · ${ore.name}!` : `${why} ${ore.name} kaçtı`);
    renderField();
    afterDig();
  }

  function slideTo(y) {
    const r = els.t.track.getBoundingClientRect();
    const k = els.t.knob.offsetHeight;
    state.task.pos = clamp((y - r.top - k / 2) / Math.max(1, r.height - k));
  }

  function renderField() {
    const end = state.phase === "end";
    els.grid.innerHTML = state.cells.map((c, i) => {
      let cls = "cell", inner = "";
      if (c.dug && c.ore < 0) {
        cls += " dug";
        inner = `<span class="near">${neighbors(i) || "·"}</span>`;
      } else if (c.dug || (end && c.ore >= 0)) {
        cls += c.dug ? " dug" : " missed";
        inner = `<span class="ore ${ORES[c.ore].id}"></span>`;
        if (c.result) inner += `<span class="mark ${c.result}">${c.result === "ok" ? "✓" : "✕"}</span>`;
      }
      return `<button class="${cls}" data-i="${i}" aria-label="Kare ${i + 1}"${c.dug || end ? " disabled" : ""}>${inner}</button>`;
    }).join("");
  }

  function render() {
    els.score.textContent = state.points;
    els.digs.textContent = state.digs;
    els.best.textContent = best();
    els.hint.textContent = state.phase === "end"
      ? "Tüm madenler ortaya çıktı."
      : state.digs === DIGS
        ? "Bir kareye dokunup kaz. Altın en değerlisi ama görevi en zoru."
        : "Boş karedeki sayı, çevresindeki 8 karede kaç maden olduğunu gösterir.";
  }

  function mount(container, context) {
    ctx = context;
    root = container;
    root.innerHTML = template();
    els = {};
    root.querySelectorAll("[data-el]").forEach((n) => { els[n.dataset.el] = n; });

    els.grid.addEventListener("click", (e) => {
      const cell = e.target.closest(".cell");
      if (cell) dig(+cell.dataset.i);
    });

    els.task.addEventListener("pointerdown", (e) => {
      if (!state.task || state.paused) return;
      const btn = e.target.closest("[data-act]");
      const act = btn && btn.dataset.act;
      if (act === "hold") {
        btn.setPointerCapture(e.pointerId);
        state.task.pointer = e.pointerId;
        press();
      } else if (act === "tap") tap();
      else if (act === "stop") stopNeedle();
      else if (act === "pad") pad(+btn.dataset.pad);
      else if (act === "hit") hit();
      else if (e.target.closest('[data-t="track"]')) {
        els.t.track.setPointerCapture(e.pointerId);
        state.drag = e.pointerId;
        slideTo(e.clientY);
      } else return;
      e.preventDefault();
    });
    els.task.addEventListener("pointermove", (e) => {
      if (state.drag === null || state.drag !== e.pointerId || !state.task) return;
      slideTo(e.clientY);
      e.preventDefault();
    });
    const onUp = (e) => {
      if (state.drag === e.pointerId) state.drag = null;
      if (state.task && state.task.pointer === e.pointerId) release();
    };
    els.task.addEventListener("pointerup", onUp);
    els.task.addEventListener("pointercancel", onUp);
    els.task.addEventListener("contextmenu", (e) => e.preventDefault());

    els.overlay.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === "play") play();
      if (act === "resume") resume();
      if (act === "guide") ctx.openGuide();
      if (act === "exit") ctx.exit();
    });

    const keyActs = { hold: press, tap, stop: stopNeedle };
    onKey = (e) => {
      if (ctx.guideOpen()) return;
      const k = e.key.toLowerCase();
      const confirm = k === " " || k === "enter";
      const up = k === "arrowup" || k === "w";
      const down = k === "arrowdown" || k === "s";
      const t = state.task;
      if (t && state.playing && !state.paused && confirm && keyActs[t.type]) {
        if (!e.repeat) keyActs[t.type]();
      }
      else if (t && t.type === "memory" && /^[1-4]$/.test(k)) { if (!e.repeat) pad(+k - 1); }
      else if (t && t.type === "slide" && !state.paused && up) state.keyDir = -1;
      else if (t && t.type === "slide" && !state.paused && down) state.keyDir = 1;
      else if (confirm && state.paused) resume();
      else if (confirm && !state.playing && overlayOpen()) play();
      else if (k === "escape" || k === "p") pause();
      else return;
      e.preventDefault();
    };
    onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "enter") release();
      if ((k === "arrowup" || k === "w") && state.keyDir === -1) state.keyDir = 0;
      if ((k === "arrowdown" || k === "s") && state.keyDir === 1) state.keyDir = 0;
    };
    onVis = () => { if (document.hidden) pause(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    reset();
    showIntro();
  }

  function unmount() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    if (state) state.playing = false;
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVis);
  }

  const GUIDE = [
    { icon: "⛏️", title: "Amaç", text: "Tarlada gizli <b>madenler</b> var. Sadece <b>3 kazı</b> hakkın var: doğru kareleri bul, görevleri tamamla, puan topla." },
    { icon: "🔢", title: "İpucu", text: "Boş bir kareyi kazarsan üzerinde bir sayı çıkar: çevresindeki <b>8 karede</b> kaç maden olduğunu gösterir. Sonraki kazını buna göre seç." },
    { icon: "🥇", title: "Madenler", text: "<b>Bronz</b> 100, <b>Gümüş</b> 250, <b>Altın</b> 600 puan. Maden değerlendikçe görevi de zorlaşır. Tarlada 5 bronz, 2 gümüş ve tek bir altın var." },
    { icon: "✋", title: "Bas-tut", text: "Butona basılı tut, dolan bar <b>yeşil alana</b> gelince bırak. Erken ya da geç bırakırsan maden kaçar. PC'de <b>Boşluk</b> tuşu da olur." },
    { icon: "↕️", title: "Kaydır", text: "Topu yukarı aşağı sürükleyip <b>hareket eden alanın</b> içinde tut. Alanda kaldıkça bar dolar, süre bitmeden doldur. PC'de <b>↑ ↓</b> veya <b>W S</b>." },
    { icon: "👆", title: "Vur", text: "Süre bitmeden butona yeterince bas. PC'de <b>Boşluk</b> tuşu da olur." },
    { icon: "⏱️", title: "Durdur", text: "İbre bar üzerinde gidip gelir. Tam <b>yeşil alandayken</b> bas, tek şansın var. PC'de <b>Boşluk</b> tuşu da olur." },
    { icon: "🧠", title: "Hafıza", text: "Dört renkli tuş sırayla yanar. Sırayı izle, sonra <b>aynı sırayla</b> bas. Tek bir hata madeni kaçırır. PC'de <b>1-4</b> tuşları da olur." },
    { icon: "🎯", title: "Yakala", text: "Maden alanda rastgele belirir ve kısa süre sonra yer değiştirir. Süre bitmeden yeterince <b>yakala</b>." },
    { icon: "🏆", title: "Puan", text: "Görevi başarırsan madenin puanını alırsın, başaramazsan maden kaçar. 3 kazı bitince tüm madenler ortaya çıkar." },
  ];

  MG.register({
    id: KEY,
    name: "Aeya",
    emoji: "⛏️",
    desc: "3 kazı hakkı, gizli madenler, bronzdan altına görevler.",
    guide: GUIDE,
    mount,
    unmount,
    pause,
  });
})();
