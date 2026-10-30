(function () {
  // Grid and cylinder geometry (in cells). W and CX depend on the mode (set in mount).
  let W = 41, CX = 20; // CX: center column; every row is symmetric around it
  const H = 92;
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
    burstMax: 4,       // Expanded: the burst goes on until the cylinder is empty, but no longer than this
    burstEject: 14,    // Expanded: cells blown out of the bottom of the cylinder per tick while bursting
    landReach: 3000,   // Expanded: cells searched (nearest first) for room when a blown-out drop lands on a pile
    releaseTip: 3,     // Expanded: the released tip opens to at least this width while draining...
    releaseEase: 0.3,  // ...and liquid passes it this much more easily
    feedMax: 0.6,      // density of the poured liquid with the slider all the way right
    feedPress: 0.6,    // denser pour pushes harder: pressure rise × (1 + this × slider)
    wide: 81,          // grid width in Expanded, leaving room for the side walls
    wallGap: 21,       // default cells from the center to the side walls at rest...
    gapMin: 4,         // ...adjustable with the wall slider down to this (hugging the cylinder; they flare out under the tip)...
    gapMax: 37,        // ...and up to this (still inside the grid)
    floorTop: 13,      // Orange floor: its surface lies this many rows under the tip at rest...
    floorSoft: 6,      // ...and the cylinder can press this deep into it
    seepRise: 6,       // a tip pressed shut against the floor squeezes liquid out beside it, up to this many rows higher
    wallWave: 1.5,     // ...curling in and out by this much
    wallFreq: 0.32,    // curl frequency along the wall (radians per row)
    wallSoft: 5,       // how deep the cylinder can press into a side wall
    squeezeMin: 1,     // the narrow slider closes the inside of the cylinder down to this half width
    arm: 6,            // only this many cells at the inner tip of each plate bend, like an arm (the rest is rigid)...
    armBend: 7,        // ...down by at most this many cells at the very tip (stays clear of the bowl's bottom)
    armThick: 2,       // cells above and below the plate's center row the arm reaches, so it stays a solid bar when bent
    rubGain: 0.06,     // dragging the held cylinder builds up rub by this much per cell dragged...
    rubVert: 3,        // ...up-down drags count this many times more (the cylinder has little room to move vertically)...
    rubFade: 0.5,      // ...and it fades by this much per second
    rubFeed: 0.5,      // full rub makes the poured liquid this much denser
    rubJoy: 0.25,      // above this rub the corner face looks delighted
    sink: 18,          // rows the cylinder can be lowered
    tipBulge: 2,       // the tip swells this many cells wider than the body...
    tipSwell: 0.2,     // ...reaching its widest this far down the tip (0..1), then rounds off into the outlet
    swayKick: 6,       // sway speed (cells/s) the tip picks up per cell the cylinder is dragged sideways
    swayStiff: 60,     // spring pulling the swaying tip back under the body
    swayDamp: 3,       // how quickly the sway dies down
    swayMax: 3,        // the tip lags at most this many cells behind
    skinWave: 1,       // the skin on the outside thickens by up to this many cells...
    skinFreq: 1.1,     // ...in small folds at this frequency (radians per row)
    crease: 0.18,      // folds of the skin darken by up to this much
    pore: 0.06,        // pores darken the skin by this much
    faceEase: 4,       // how quickly the face follows the pressure (per second)
    reliefTime: 2,     // seconds the relieved look lasts after the drain stops
    cutTime: 3,        // seconds the frustrated look lasts after a drain is cut short by holding again
    recover: 6,        // dent depth the soft walls win back per second
    falloff: 0.55,     // a dent fades by this much per cell away from the contact, so it stays round
    soak: 0.03,        // chance per tick that spilled liquid resting against the soft floor or walls soaks in
    softShade: 0.03,   // pink darkens by this much per cell away from its surface...
    softDeep: 4,       // ...for up to this many cells
    castShadow: 0.7,   // brightness of what lies in the cylinder's shadow
  };

  let KEY, X = false;  // X: Expanded mode
  let OX = 0, OY = 0;  // cylinder offset from its rest position (cells)
  let gap = CFG.wallGap; // current distance of the side walls from the center
  let flowOn = true;   // the pour can be stopped with a button
  let squeeze = 0;     // cells the inside of the cylinder is narrowed by on each side (Expanded slider)
  let ground = "pink"; // Expanded floor: "pink" (curly walls, plates and bowl) or "orange" (just a soft floor at the bottom)
  let pourMode = "auto"; // Expanded pour: "auto" (steady) or "rub" (only while the held cylinder is dragged around)

  // Open columns [lo, hi) of row y. The bottom curves in like x^SHAPE and ends in a tip `tip` cells wide.
  // In Expanded the body runs straight down to a tip that swells, then rounds off into the outlet; rows are shifted
  // sideways by the sway, and the inside narrows by `sq` cells per side (the wall thickens inward).
  function span(y, tip, ox = OX, oy = OY, sq = squeeze) {
    const body = BODY + Math.round((tip - 1) / 4);
    const r = y - oy, c = CX + ox + (r >= 0 && r <= VALVE ? SW[r] : 0);
    let half = body;
    if (X && r >= FUNNEL) {
      const u = (r - FUNNEL) / (VALVE - FUNNEL), p = CFG.tipSwell, end = (tip - 1) / 2;
      half = Math.round(u < p
        ? body + CFG.tipBulge * Math.sin((u / p) * Math.PI / 2)
        : end + (body + CFG.tipBulge - end) * Math.sqrt(1 - ((u - p) / (1 - p)) ** 2));
    }
    else if (r >= NECK) half = (tip - 1) / 2;
    else if (r >= FUNNEL) half = Math.round(body * Math.pow(1 - (r - FUNNEL) / (NECK - FUNNEL), 1 / SHAPE));
    if (r >= TOP && r < NECK) half = Math.max(Math.min(half, CFG.squeezeMin), half - sq);
    return [c - half, c + half + 1];
  }

  // Extra skin cells on the outside of cylinder row r (Expanded only, not on the tip).
  function skin(r) {
    return X && r < FUNNEL ? Math.round(CFG.skinWave * (0.5 + 0.5 * Math.sin(r * CFG.skinFreq))) : 0;
  }

  const BG = [26, 29, 38];
  const GLASS = [146, 104, 88];  // inside of the cylinder: a deep skin tone
  const WALL = [238, 190, 156];  // cylinder wall: skin tone
  const TIP_WALL = [228, 122, 118], TIP_GLASS = [138, 62, 70]; // reddish tip (Expanded)
  const PINK = [232, 128, 166];
  const PINK_TOP = [250, 178, 204]; // pink surface lit from the top left...
  const PINK_RIM = [196, 92, 132];  // ...and in shade on the bottom right
  const ORANGE = [240, 150, 72], ORANGE_TOP = [255, 196, 120], ORANGE_RIM = [204, 112, 48]; // orange floor, lit the same way
  const BOWL_GLASS = [86, 58, 82];
  const K_BG = 0, K_WALL = 1, K_GLASS = 2, K_BOWL = 3, K_PINK = 4;
  let OPEN, CYL, FOOT, BASE; // open cells, cylinder interior, cylinder wall, base colors
  let KIND, DEPTH;           // what each cell is, and how deep inside the pink it lies
  let WL, WR, FTOP;          // rest edges of the side walls (per row) and the floor top (per column)
  let DL, DR, DF;            // how many cells the walls and the floor are pressed in
  let SW;                    // sideways sway of each cylinder row (cells, by row relative to the cylinder)
  let seen, stamp = 0;       // scratch marks for settle()

  function inOval(x, y) {
    const dx = (Math.abs(x - CX) - (HOLE + 0.5 + OVAL_RX)) / OVAL_RX;
    const dy = (y - PLATE) / OVAL_RY;
    return dx * dx + dy * dy <= 1;
  }

  // The two plates; in Expanded their bendable inner tips (arms) are a solid bar 2 × armThick + 1 cells thick.
  function plate(x, y) {
    return inOval(x, y) || (X && lever(x) > 0 && Math.abs(y - PLATE) <= CFG.armThick);
  }

  // Below the tip: air above the plates, then the bowl under the hole between them.
  function openBelow(x, y) {
    if (plate(x, y)) return false;
    const off = Math.abs(x - CX);
    if (y < PLATE) return X || off <= HOLE + 2 * OVAL_RX;
    if (y > BOTTOM) return off === 0;
    const t = (y - PLATE) / (BOTTOM - PLATE);
    return off <= HOLE + (BOWL - HOLE) * 2 * Math.sqrt(t * (1 - t));
  }

  // Soft pink in Expanded: curly side walls, plus the floor (plates and everything under them) pressed in from the top.
  function soft(x, y) {
    if (ground === "orange") return y >= VALVE + CFG.floorTop + DF[x];
    if (x <= WL[y] - DL[y] || x >= WR[y] + DR[y]) return true;
    // A bent plate tip moves its plate cells down DF[x] rows into the bowl; the rest of the floor stays put.
    return y > VALVE && (plate(x, y - DF[x]) || (!plate(x, y) && !openBelow(x, y)));
  }

  // Rest edges of the curly side walls at the current gap; under the tip they flare out to clear the plates and the bowl.
  function walls() {
    if (ground === "orange") { WL.fill(-W); WR.fill(2 * W); return; } // no side walls
    const floor = HOLE + 2 * OVAL_RX + 1;
    for (let y = 0; y < H; y++) {
      const g = Math.max(gap, floor * Math.min(1, Math.max(0, (y - VALVE + 4) / 8)));
      WL[y] = CX - Math.round(g + CFG.wallWave * Math.sin(y * CFG.wallFreq));
      WR[y] = CX + Math.round(g + CFG.wallWave * Math.sin(y * CFG.wallFreq + 2));
    }
  }

  // Calls fn(x, y) for every cell of the cylinder wall at offset (ox, oy).
  function eachWall(tip, ox, oy, fn) {
    const top = TOP + oy, valve = VALVE + oy;
    for (let y = top - 1; y <= valve; y++) {
      let L = Infinity, R = -Infinity;
      for (let ny = Math.max(top, y - 1); ny <= Math.min(valve, y + 1); ny++) {
        const [lo, hi] = span(ny, tip, ox, oy, 0); // outer outline stays put when the inside narrows
        L = Math.min(L, lo);
        R = Math.max(R, hi);
      }
      const [lo, hi] = span(y, tip, ox, oy), e = skin(y - oy);
      for (let x = L - 1 - e; x < lo; x++) fn(x, y);
      for (let x = hi; x <= R + e; x++) fn(x, y);
    }
  }

  function build(tip) {
    CYL.fill(0);
    FOOT.fill(0);
    OPEN.fill(0);
    BASE.fill(0);
    const top = TOP + OY, valve = VALVE + OY;
    for (let y = 0; y <= valve; y++) {
      const [lo, hi] = span(y, tip);
      for (let x = lo; x < hi; x++) CYL[y * W + x] = 1;
    }
    eachWall(tip, OX, OY, (x, y) => { if (x >= 0 && x < W) FOOT[y * W + x] = 1; });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (CYL[i]) OPEN[i] = 1;
        else if (!FOOT[i] && y > VALVE) OPEN[i] = (X ? !soft(x, y) : openBelow(x, y)) ? 1 : 0;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let k = K_BG;
        if (FOOT[i]) {
          k = K_WALL;
        } else if (OPEN[i]) {
          if (CYL[i] && y >= top) k = K_GLASS;
          else if (ground === "pink" && y >= PLATE && y <= BOTTOM + 2 && (openBelow(x, y) || (X && plate(x, y)))) k = K_BOWL;
        } else if (X) {
          if (soft(x, y)) k = K_PINK;
        } else if ((y > VALVE && inOval(x, y)) || (y >= PLATE && y <= BOTTOM + 2 && Math.abs(x - CX) <= HOLE + 2 * OVAL_RX)) {
          k = K_PINK;
        } else {
          for (let dy = -1; dy <= 1 && k === K_BG; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < W && ny >= PLATE && ny <= BOTTOM + 2 && OPEN[ny * W + nx]) { k = K_PINK; break; }
            }
          }
        }
        KIND[i] = k;
      }
    }
    // Distance into the pink (1 = surface cell); the grid border counts as more pink.
    for (let i = 0; i < W * H; i++) DEPTH[i] = KIND[i] === K_PINK ? 255 : 0;
    for (let i = 0; i < W * H; i++) {
      if (!DEPTH[i]) continue;
      if (i % W > 0) DEPTH[i] = Math.min(DEPTH[i], DEPTH[i - 1] + 1);
      if (i >= W) DEPTH[i] = Math.min(DEPTH[i], DEPTH[i - W] + 1);
    }
    for (let i = W * H - 1; i >= 0; i--) {
      if (!DEPTH[i]) continue;
      if (i % W < W - 1) DEPTH[i] = Math.min(DEPTH[i], DEPTH[i + 1] + 1);
      if (i < W * (H - 1)) DEPTH[i] = Math.min(DEPTH[i], DEPTH[i + W] + 1);
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x, k = KIND[i];
        let c = BG, f = 1;
        if (k === K_WALL || k === K_GLASS) {
          // Round cylinder lit from the left, with a glint on the glass.
          const r = y - OY, sx = x - OX - (r >= 0 && r <= VALVE ? SW[r] : 0);
          const t = (sx - CX) / (BODY + 2);
          f = 1 - 0.2 * t - 0.12 * t * t;
          c = k === K_WALL ? WALL : Math.abs(t + 0.45) < 0.12 ? GLASS.map((v) => v + 26) : GLASS;
          if (X && r >= FUNNEL - 3) {
            // The tip blushes red, fading in just above where it swells.
            const a = Math.min(1, (r - FUNNEL + 3) / 4), red = k === K_WALL ? TIP_WALL : TIP_GLASS;
            c = c.map((v, n) => v + (red[n] - v) * a);
          } else if (X && k === K_WALL) {
            // Skin folds along the wavy outline, plus a few pores; both move with the cylinder.
            const h = ((sx * 73856093) ^ (r * 19349663)) >>> 0;
            f *= 1 - CFG.crease * (0.5 - 0.5 * Math.sin(r * CFG.skinFreq)) - (h % 3 ? 0 : CFG.pore);
          }
        } else if (k === K_BOWL) {
          c = BOWL_GLASS;
        } else if (k === K_PINK) {
          const o = ground === "orange";
          if (DEPTH[i] === 1 && ((y > 0 && KIND[i - W] !== K_PINK) || (x > 0 && KIND[i - 1] !== K_PINK))) c = o ? ORANGE_TOP : PINK_TOP;
          else if (DEPTH[i] === 1) c = o ? ORANGE_RIM : PINK_RIM;
          else { c = o ? ORANGE : PINK; f = 1 - CFG.softShade * Math.min(DEPTH[i] - 1, CFG.softDeep); }
        }
        const o = i * 4;
        BASE[o] = c[0] * f; BASE[o + 1] = c[1] * f; BASE[o + 2] = c[2] * f; BASE[o + 3] = 255;
      }
    }
    // The cylinder casts a shadow down and to the right.
    for (let i = 0; i < W * H; i++) {
      if (KIND[i] !== K_WALL && KIND[i] !== K_GLASS) continue;
      const j = i + W + 2;
      if (j >= W * H || i % W >= W - 2 || (KIND[j] !== K_BG && KIND[j] !== K_PINK) || DEPTH[j] === 254) continue;
      DEPTH[j] = 254; // marks it shaded once
      const o = j * 4;
      BASE[o] *= CFG.castShadow; BASE[o + 1] *= CFG.castShadow; BASE[o + 2] *= CFG.castShadow;
    }
  }

  function tipWidth() {
    if (state.burst) return CFG.tipBurst;
    const w = 1 + 2 * Math.min(CFG.tipSteps - 1, Math.floor((state.pressure / 100) * CFG.tipSteps));
    // Expanded: a released tip opens up so more drains out.
    return X && !state.holding && state.gate === "open" ? Math.max(w, CFG.releaseTip) : w;
  }

  function reshape(tip) {
    const s = state, before = OPEN.slice();
    s.tip = tip;
    build(tip);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (s.liq[i] && !OPEN[i]) {
          // Liquid squeezed out by the narrowing cylinder gets pressed into the rest of it.
          if (X && y >= TOP + OY && y <= VALVE + OY) s.boost += CFG.compress * (1 + s.dens[i]);
          s.liq[i] = 0;
          s.dens[i] = 0;
        } else if (CYL[i] && !before[i] && y >= s.surface) {
          // The walls stretch outward under the liquid, so the level stays put.
          const j = i + (x < CX + OX ? 1 : -1);
          s.liq[i] = 1;
          s.dens[i] = s.liq[j] ? s.dens[j] : 0;
        }
      }
    }
  }

  // Dents the soft walls and floor need so the cylinder fits at (ox, oy); ok is false if it would press in too deep.
  function dents(ox, oy) {
    const l = new Int16Array(H), r = new Int16Array(H), f = new Int16Array(W);
    let ok = true;
    eachWall(state.tip, ox, oy, (x, y) => {
      if (x < 0 || x >= W) { ok = false; return; }
      l[y] = Math.max(l[y], WL[y] - x + 1);
      r[y] = Math.max(r[y], x - WR[y] + 1);
      if (y >= FTOP[x]) f[x] = Math.max(f[x], y - FTOP[x] + 1);
    });
    // Walls already squeezed past the limit (by the gap slider) still let the cylinder back out.
    for (let y = 0; y < H; y++) if (l[y] > Math.max(CFG.wallSoft, DL[y]) || r[y] > Math.max(CFG.wallSoft, DR[y])) ok = false;
    if (ground === "orange") {
      // The whole orange floor is soft; one already pressed past its limit still lets the cylinder back out.
      for (let x = 0; x < W; x++) if (f[x] > Math.max(CFG.floorSoft, DF[x])) ok = false;
      return { l, r, f, b: [0, 0], over: new Int16Array(W), ok };
    }
    // The floor is rigid except the plate tips, which swing down like arms: each side bends as far as its deepest push needs.
    // Like the walls, a floor already pressed past its limit (by the sway or a widening tip) still lets the cylinder move,
    // as long as no move makes it worse.
    const b = [0, 0], over = new Int16Array(W), s = state;
    for (let x = 0; x < W; x++) {
      if (!f[x]) continue;
      const k = lever(x);
      if (k) b[x < CX ? 0 : 1] = Math.max(b[x < CX ? 0 : 1], f[x] / k);
      else if ((over[x] = f[x]) > s.over[x]) ok = false;
    }
    if (b[0] > Math.max(CFG.armBend, s.bend[0]) || b[1] > Math.max(CFG.armBend, s.bend[1])) ok = false;
    return { l, r, f, b, over, ok };
  }

  // How much floor column x moves with its plate's bending tip: 1 at the tip, falling to 0 at the hinge and beyond.
  function lever(x) {
    const off = Math.abs(x - CX) - HOLE;
    return off >= 1 && off <= CFG.arm ? (CFG.arm + 1 - off) / CFG.arm : 0;
  }

  // Presses the soft walls in where needed and lets them spring back over dt seconds; true if any cell changed.
  function fit(need, dt) {
    const s = state;
    let changed = false;
    const sets = [[s.dl, DL, need.l], [s.dr, DR, need.r]];
    // The orange floor dents round like the walls.
    if (ground === "orange") sets.push([s.df, DF, need.f]);
    else {
      // Plate tips spring back up as a whole; each column drops with its lever.
      for (const k of [0, 1]) s.bend[k] = Math.max(need.b[k], s.bend[k] - CFG.recover * dt);
      s.over = need.over;
      for (let x = 0; x < W; x++) {
        const v = Math.ceil(s.bend[x < CX ? 0 : 1] * lever(x) - 1e-6);
        if (v !== DF[x]) { DF[x] = v; changed = true; }
      }
    }
    for (const [d, cells, n] of sets) {
      for (let k = 0; k < d.length; k++) d[k] = Math.max(n[k], d[k] - CFG.recover * dt);
      for (let k = 1; k < d.length; k++) d[k] = Math.max(d[k], d[k - 1] - CFG.falloff);
      for (let k = d.length - 2; k >= 0; k--) d[k] = Math.max(d[k], d[k + 1] - CFG.falloff);
      for (let k = 0; k < d.length; k++) {
        const v = Math.max(n[k], Math.round(d[k]));
        if (v !== cells[k]) { cells[k] = v; changed = true; }
      }
    }
    return changed;
  }

  function soften(dt) {
    if (fit(dents(OX, OY), dt)) reshape(state.tip);
  }

  // Moves the cylinder one cell, taking its liquid along. False when it's out of room or the walls can't give more.
  function nudge(dx, dy) {
    const s = state, ox = OX + dx, oy = OY + dy;
    if (oy < 0 || oy > CFG.sink) return false;
    const need = dents(ox, oy);
    if (!need.ok) return false;
    const carried = [];
    for (let i = 0; i < W * H; i++) {
      if (CYL[i] && s.liq[i]) { carried.push(i, s.dens[i]); s.liq[i] = 0; s.dens[i] = 0; }
    }
    OX = ox;
    OY = oy;
    fit(need, 0);
    build(s.tip);
    for (let k = 0; k < carried.length; k += 2) {
      const j = carried[k] + dy * W + dx;
      if (CYL[j] && !s.liq[j]) { s.liq[j] = 1; s.dens[j] = carried[k + 1]; }
      else s.boost += CFG.compress * (1 + carried[k + 1]);
    }
    for (let i = 0; i < W * H; i++) {
      if (s.liq[i] && !OPEN[i]) { s.liq[i] = 0; s.dens[i] = 0; }
    }
    s.surface += dy;
    s.swayV -= dx * CFG.swayKick;
    return true;
  }

  // Dragging the held cylinder around (by `cells`, even where it can't move further) builds up rub.
  function rub(cells) {
    if (state.holding) state.rub = Math.min(1, state.rub + CFG.rubGain * cells);
  }

  // The cylinder sways when dragged sideways: the tip lags behind and swings back on a spring, taking its liquid along.
  function swing(dt) {
    const s = state;
    s.swayV += (-CFG.swayStiff * s.sway - CFG.swayDamp * s.swayV) * dt;
    s.sway = Math.max(-CFG.swayMax, Math.min(CFG.swayMax, s.sway + s.swayV * dt));
    const next = SW.map((_, r) => (r < TOP ? 0 : Math.round(s.sway * ((r - TOP) / (VALVE - TOP)) ** 2)));
    if (next.every((v, r) => v === SW[r])) return;
    const carried = [];
    for (let y = TOP + OY; y <= VALVE + OY; y++) {
      const d = next[y - OY] - SW[y - OY];
      if (!d) continue;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (CYL[i] && s.liq[i]) { carried.push(i + d, s.dens[i]); s.liq[i] = 0; s.dens[i] = 0; }
      }
    }
    SW.set(next);
    fit(dents(OX, OY), 0);
    build(s.tip);
    for (let k = 0; k < carried.length; k += 2) {
      const j = carried[k];
      if (CYL[j] && !s.liq[j]) { s.liq[j] = 1; s.dens[j] = carried[k + 1]; }
    }
    for (let i = 0; i < W * H; i++) {
      if (s.liq[i] && !OPEN[i]) { s.liq[i] = 0; s.dens[i] = 0; }
    }
  }

  // Steps the cylinder toward where the player is pulling it, one cell per frame on each axis.
  function drive() {
    const a = state.aim;
    a.y = Math.max(0, Math.min(CFG.sink, a.y));
    const dx = Math.sign(a.x - OX);
    // Blocked sideways (e.g. caught on a plate deep in the bowl): ride up a row and try again.
    if (dx && !nudge(dx, 0)) {
      if (OY > 0 && nudge(0, -1)) a.y = OY;
      else a.x = OX;
    }
    if (a.y !== OY && !nudge(0, Math.sign(a.y - OY))) a.y = OY;
  }

  let ctx, root, els, raf, state, onKey, onKeyUp, onVis, buf, bctx, img, cs = 1, mode;
  const onResize = () => resize();

  function template() {
    return `
      <div class="weita">
        <div class="weita-hud">
          <span class="pill">Puan: <b data-el="score">0</b></span>
          ${X ? "" : `<span class="pill">Süre: <b data-el="time">0</b>s</span>`}
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
          <div class="presia-feed">
            <span class="col-label">Akış</span>
            <input type="range" min="0" max="100" value="30" data-el="flow" aria-label="Akan sıvının miktarı">
            <button type="button" class="pill pill-btn presia-stop" data-el="stopBtn" aria-label="Akışı durdur ya da aç"></button>
          </div>
          <label class="presia-feed">
            <span class="col-label">Yoğunluk</span>
            <input type="range" min="0" max="100" value="0" data-el="feed" aria-label="Akan sıvının yoğunluğu">
          </label>${X ? `
          <div class="presia-feed">
            <button type="button" class="pill pill-btn" data-el="groundBtn" aria-label="Zemini değiştir"></button>
            <button type="button" class="pill pill-btn" data-el="pourBtn" aria-label="Akış modunu değiştir"></button>
          </div>
          <label class="presia-feed" data-el="gapRow">
            <span class="col-label">Duvar</span>
            <input type="range" min="${CFG.gapMin}" max="${CFG.gapMax}" value="${gap}" data-el="gap" aria-label="Pembe duvarların silindire uzaklığı">
          </label>
          <label class="presia-feed">
            <span class="col-label">Daralt</span>
            <input type="range" min="0" max="${BODY - CFG.squeezeMin}" value="${squeeze}" data-el="squeeze" aria-label="Silindirin içini daralt">
          </label>` : ""}
        </div>
        <p class="weita-hint">${mode.hint}</p>
        <div class="weita-toast" data-el="toast"></div>
        <div class="overlay" data-el="overlay"></div>
      </div>`;
  }

  function best() { return ctx.storage.get(KEY + ":best", 0); }

  // corner: in Expanded the pause and end panels sit small in a corner, leaving the scene visible and sharp.
  function showOverlay(html, corner) {
    els.overlay.innerHTML = `<div class="panel">${html}</div>`;
    els.overlay.classList.toggle("presia-corner", X && !!corner);
    els.overlay.classList.remove("hidden");
  }

  function overlayOpen() { return !els.overlay.classList.contains("hidden"); }

  function showIntro() {
    showOverlay(`
      <h3>${mode.name}</h3>
      <p>${mode.intro}</p>
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
      </div>`, true);
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
      </div>`, true);
  }

  function reset() {
    cancelAnimationFrame(raf);
    OX = OY = 0;
    DL.fill(0);
    DR.fill(0);
    DF.fill(0);
    SW.fill(0);
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
      drag: null,       // where a drag started (pointer and cylinder offset)
      aim: { x: 0, y: 0 }, // cylinder offset the player is pulling toward
      dl: new Float32Array(H), // smooth dents of the left wall, right wall and floor
      dr: new Float32Array(H),
      df: new Float32Array(W), // smooth dents of the orange floor
      bend: [0, 0],     // how far the left and right plate tips are bent down (cells at the very tip)
      over: new Int16Array(W), // how deep the cylinder currently sits in the rigid floor, per column
      rub: 0,           // 0..1, builds up while the cylinder is held and dragged around
      boost: 0,
      face: { stress: 0, relief: 0, cut: 0 }, // corner face: smoothed pressure, relieved look while draining, frustration
      sway: 0,          // how far the tip lags sideways (cells), and how fast it swings
      swayV: 0,
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
    if (from !== VALVE + OY || y !== VALVE + OY + 1) return true;
    return leaks(v);
  }

  // Does a cell of density v get through the open valve this try?
  function leaks(v) {
    if (state.gate === "burst") return true;
    const ease = Math.max(CFG.dripMin, (1 - v) * (1 - v)) + (state.pressure / 100) * CFG.pushFlow + (X ? CFG.releaseEase : 0);
    return state.gate === "open" && Math.random() < CFG.leak * ease;
  }

  function slide(i, x, y, dir) {
    let nx = x;
    for (let n = 0; n < CFG.spread && free(nx + dir, y, state.dens[i], y); n++) nx += dir;
    if (nx === x) return false;
    move(i, i + nx - x);
    return true;
  }

  // The outlet is pressed shut against the floor: liquid squeezes out just outside the tip instead.
  function seep(i, x, y) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let dy = 0; dy <= CFG.seepRise; dy++) {
      for (const d of [dir, -dir]) {
        const row = (y - dy) * W;
        let nx = x;
        while (nx >= 0 && nx < W && (CYL[row + nx] || FOOT[row + nx])) nx += d;
        if (nx >= 0 && nx < W && OPEN[row + nx] && !state.liq[row + nx]) { move(i, row + nx); return true; }
      }
    }
    return false;
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
    const top = TOP + OY, valve = VALVE + OY, limit = LIMIT + OY;
    // Once the liquid has pushed on the tip, small dips in the level don't let go of it.
    const reached = s.surface <= limit + (s.gate === "closed" ? 0 : CFG.hyst);
    if (s.burst) s.gate = "burst";
    else if (s.holding) s.gate = reached ? "held" : "closed";
    // Released: stored pressure keeps pushing liquid out even below the line.
    else s.gate = reached || s.pressure > 0 ? "open" : "closed";
    s.tick++;

    // Rub mode: liquid only pours while the held cylinder is being dragged around.
    if (flowOn && !(X && s.burst)) s.pour += (CFG.flowMin + (CFG.flowMax - CFG.flowMin) * s.flow) * (X && pourMode === "rub" ? s.rub : 1);
    if (X && s.burst) eject();
    const c = CX + OX;
    for (const x of [c, c - 1, c + 1, c - 2, c + 2]) {
      if (s.pour < 1) break;
      if (!liq[x]) { liq[x] = 1; d[x] = Math.min(1, s.feed * CFG.feedMax + s.rub * CFG.rubFeed); s.pour -= 1; }
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
        if (X && y === valve && CYL[i] && !OPEN[i + W] && s.gate !== "held" && leaks(v) && seep(i, x, y)) continue;
        // Blocked valve: liquid landing above the line gets squeezed into the column.
        if (s.gate === "held" && y >= top && y < limit) {
          s.boost += CFG.compress * (1 + d[i]);
          liq[i] = 0;
          d[i] = 0;
          continue;
        }
        const dir = Math.random() < 0.5 ? 1 : -1;
        if (free(x + dir, y + 1, v, y)) move(i, i + W + dir);
        else if (free(x - dir, y + 1, v, y)) move(i, i + W - dir);
        // Spilled liquid resting against the soft floor or walls sinks into it, so the bowl never backs up into the tip.
        else if (X && !CYL[i] && (KIND[i + W] === K_PINK || KIND[i - 1] === K_PINK || KIND[i + 1] === K_PINK) && Math.random() < CFG.soak) { liq[i] = 0; d[i] = 0; }
        else if (!slide(i, x, y, dir)) slide(i, x, y, -dir);
      }
    }

    for (let y = top; y <= valve; y++) {
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
        const i = limit * W + Math.floor(Math.random() * (valve + 1 - limit) * W);
        if (CYL[i] && liq[i] && d[i] < 1) { d[i] = Math.min(1, d[i] + CFG.grain); s.boost -= CFG.grain; break; }
      }
    }

    measure();
  }

  // Liquid level (topmost mostly-full row) and average whiteness below the line.
  function measure() {
    const s = state;
    let surface = FUNNEL + OY;
    for (let y = FUNNEL + OY - 1; y >= TOP + OY; y--) {
      const [lo, hi] = span(y, s.tip);
      let n = 0;
      for (let x = lo; x < hi; x++) n += s.liq[y * W + x];
      if (n < (hi - lo) * 0.6) break;
      surface = y;
    }
    let sum = 0, count = 0;
    for (let i = (LIMIT + OY) * W; i < (VALVE + OY + 1) * W; i++) {
      if (CYL[i] && s.liq[i]) { sum += s.dens[i]; count++; }
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
      const b = state.burst;
      if (!X && b.t >= CFG.burstTime) return finish("burst");
      if (X && ((b.t >= CFG.burstTime && b.empty) || b.t >= CFG.burstMax)) {
        // Expanded: the round goes on once the spray dies down, and the face is relieved.
        state.burst = null;
        state.pressure = 0;
        state.face.relief = 1;
      }
    } else {
      state.rub = Math.max(0, state.rub - CFG.rubFade * dt);
      const w = state.white;
      if (state.gate === "held") state.pressure += (CFG.rise + CFG.whiteRise * w * w) * (1 + CFG.feedPress * state.feed) * (1 + CFG.flowPress * state.flow) * dt;
      else state.pressure = Math.max(0, state.pressure - CFG.fall * dt);

      if (state.pressure >= 100) startBurst();
      else if (state.white >= CFG.win) return finish("win");
      else if (!X && state.time >= CFG.duration) { state.time = CFG.duration; return finish("time"); }
    }

    const tip = tipWidth();
    if (tip !== state.tip) reshape(tip);
    if (X) { drive(); swing(dt); soften(dt); mood(dt); }
    render();
    raf = requestAnimationFrame(loop);
  }

  function startBurst() {
    state.pressure = 100;
    state.burst = { t: 0, white: state.white };
    state.holding = false;
    state.pointer = null;
  }

  // Expanded burst: blows the liquid out of the bottom of the cylinder as droplets until it's empty.
  function eject() {
    const s = state, b = s.burst;
    let n = CFG.burstEject;
    for (let y = VALVE + OY; y >= 0 && n > 0; y--) {
      for (let x = 0; x < W && n > 0; x++) {
        const i = y * W + x;
        if (!CYL[i] || !s.liq[i]) continue;
        const power = Math.max(0.3, 1 - b.t / CFG.burstMax);
        s.drops.push({
          x: CX + OX + SW[VALVE] + 0.5 + (Math.random() - 0.5) * s.tip,
          y: VALVE + OY + 1,
          vx: (Math.random() - 0.5) * 36 * power,
          vy: 10 + Math.random() * 60 * power,
          life: 0.6 + Math.random() * 0.6,
          d: s.dens[i],
          real: true,     // lands as liquid instead of fading away
        });
        s.liq[i] = 0;
        s.dens[i] = 0;
        n--;
      }
    }
    b.empty = n === CFG.burstEject;
  }

  // Droplets spraying out of the tip while bursting (in cell units).
  function spray(dt) {
    const s = state;
    if (s.burst) {
      const power = Math.max(0, 1 - s.burst.t / CFG.burstTime);
      const count = Math.round(160 * power * dt + Math.random());
      for (let n = 0; n < count; n++) {
        s.drops.push({
          x: CX + OX + SW[VALVE] + 0.5 + (Math.random() - 0.5) * s.tip,
          y: VALVE + OY + 1,
          vx: (Math.random() - 0.5) * 30 * (0.4 + power),
          vy: -8 + Math.random() * 40 * (0.5 + power),
          life: 0.5 + Math.random() * 0.5,
          d: s.burst.white,
        });
      }
    }
    s.drops = s.drops.filter((p) => {
      const px = p.x, py = p.y;
      p.vy += 45 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.real ? !land(p, px, py) : p.life > 0;
    });
  }

  // A drop blown out of the cylinder flies until it hits something, then settles as liquid in the free cell nearest
  // to where it was just before, so none of it is lost. It bounces off the sides of the grid.
  function land(p, px, py) {
    if (p.x < 0 || p.x >= W) { p.vx *= -0.5; p.x = Math.max(0, Math.min(W - 0.01, p.x)); }
    const x = Math.floor(p.x), y = Math.floor(p.y);
    if (y >= H) return true;
    if (y < 0) return false;
    const i = y * W + x;
    if (OPEN[i] && !CYL[i] && !state.liq[i]) return false;
    settle(Math.max(0, Math.min(W - 1, Math.floor(px))) + Math.max(0, Math.min(H - 1, Math.floor(py))) * W, p.d);
    return true;
  }

  // Spreads out from cell `start` through open cells outside the cylinder and fills the nearest empty one.
  function settle(start, d) {
    const s = state, q = [start];
    seen[start] = ++stamp;
    for (let k = 0; k < q.length && k < CFG.landReach; k++) {
      const i = q[k];
      if (!s.liq[i] && OPEN[i] && !CYL[i]) { s.liq[i] = 1; s.dens[i] = d; return; }
      const x = i % W;
      for (const j of [i - W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i + W]) {
        if (j < 0 || j >= W * H || seen[j] === stamp || !OPEN[j] || CYL[j]) continue;
        seen[j] = stamp;
        q.push(j);
      }
    }
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

    const limit = LIMIT + OY, valve = VALVE + OY;
    c.save();
    c.strokeStyle = s.surface <= limit ? "#e0533a" : "rgba(224, 83, 58, .5)";
    c.lineWidth = Math.max(2, cs * 0.35);
    c.setLineDash([cs, cs * 0.7]);
    c.beginPath();
    const [lineLo, lineHi] = span(limit, s.tip);
    c.moveTo(lineLo * cs, limit * cs);
    c.lineTo(lineHi * cs, limit * cs);
    c.stroke();
    c.restore();

    if (s.holding) {
      c.save();
      c.fillStyle = "#f28c38";
      if (s.gate === "held") { c.shadowColor = "rgba(242, 140, 56, .8)"; c.shadowBlur = cs * 2; }
      c.beginPath();
      const [lo, hi] = span(valve, s.tip);
      const args = [(lo - 1) * cs, (valve + 1) * cs, (hi - lo + 2) * cs, cs * 2.5];
      if (c.roundRect) c.roundRect(...args, cs); else c.rect(...args);
      c.fill();
      c.restore();
    }

    for (const p of s.drops) {
      c.fillStyle = `rgba(255, 255, 255, ${(p.real ? 1 : Math.min(1, p.life * 2)) * (0.5 + 0.5 * p.d)})`;
      c.beginPath();
      c.arc(p.x * cs, p.y * cs, cs * 0.55, 0, Math.PI * 2);
      c.fill();
    }
    if (X) drawFace(c);
  }

  // The corner face tenses up as the pressure builds and sighs with relief while the pressure drains.
  function mood(dt) {
    const s = state, f = s.face;
    f.stress += ((s.burst ? 1 : s.pressure / 100) - f.stress) * Math.min(1, CFG.faceEase * dt);
    f.cut = Math.max(0, f.cut - dt / CFG.cutTime);
    if (!s.holding && s.gate === "open" && s.pressure > 0) {
      f.relief = 1;
      f.cut = 0;
    } else {
      // Holding again in the middle of a drain cuts the relief short: frustrated.
      if (s.holding && f.relief === 1) { f.cut = 1; f.relief = 0; }
      f.relief = Math.max(0, f.relief - dt / CFG.reliefTime);
    }
  }

  // Pixel art features on a 13×13 face. Eyes and brows are given for the left side and mirrored.
  const FACE = {
    calm:   { eye: [[4, 5], [4, 6]], brow: [[3, 3], [4, 3]], mouth: [[4, 9], [5, 10], [6, 10], [7, 10], [8, 9]] },
    tense:  { eye: [[3, 6], [4, 6]], brow: [[3, 3], [4, 3], [5, 4]], mouth: [[4, 9], [5, 9], [6, 9], [7, 9], [8, 9]] },
    strain: { eye: [[3, 6], [4, 6]], brow: [[3, 3], [4, 4], [5, 4]], teeth: true },
    max:    { eye: [[3, 5], [4, 6], [3, 7]], brow: [[2, 3], [3, 3], [4, 4], [5, 4]], teeth: true },
    cut:    { eye: [[3, 5], [4, 6], [3, 7]], brow: [[2, 2], [3, 3], [4, 4], [5, 4]], tear: [[3, 8], [3, 9]],
              mouth: [[3, 10], [4, 9], [5, 10], [6, 9], [7, 10], [8, 9], [9, 10]], vein: [[4, 1], [5, 2], [4, 3], [3, 2]] },
    joy:    { eye: [[3, 6], [4, 5], [5, 6]], brow: [[3, 2], [4, 2]], blush: [[2, 8], [3, 8]],
              mouth: [[4, 9], [5, 9], [6, 9], [7, 9], [8, 9], [5, 10], [6, 10], [7, 10]] },
    relief: { eye: [[3, 6], [4, 7], [5, 6]], brow: [[3, 3], [4, 3]], mouth: [[4, 9], [5, 10], [6, 10], [7, 10], [8, 9]], blush: [[2, 8], [3, 8]] },
    shock:  { eye: [[3, 4], [4, 4], [5, 4], [3, 5], [5, 5], [3, 6], [4, 6], [5, 6]], brow: [[3, 2], [4, 2]],
              mouth: [[6, 8], [5, 9], [6, 9], [7, 9], [5, 10], [6, 10], [7, 10], [6, 11]] },
  };

  function drawFace(c) {
    const f = state.face, shock = !!state.burst, rel = shock ? 0 : f.relief, cut = !shock && f.cut > 0;
    const st = cut ? 1 : f.stress * (1 - rel);
    const joy = !shock && !cut && state.rub > CFG.rubJoy;
    const look = FACE[shock ? "shock" : cut ? "cut" : joy ? "joy" : rel > 0.4 ? "relief" : st > 0.75 ? "max" : st > 0.55 ? "strain" : st > 0.3 ? "tense" : "calm"];
    // Shakes a cell at a time when it's about to burst.
    const jig = () => (st > 0.8 && Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0);
    const ox = W - 14 + jig(), oy = 1 + jig();
    const px = (x, y, color) => { c.fillStyle = color; c.fillRect((ox + x) * cs, (oy + y) * cs, cs, cs); };
    const both = (cells, color) => { for (const [x, y] of cells) { px(x, y, color); px(12 - x, y, color); } };
    const ink = "#3a2222";
    // Head: skin tone that flushes red under stress, a little darker toward the bottom right.
    const skin = WALL.map((v, k) => Math.round(v + ([236, 104, 86][k] - v) * st));
    for (let y = 0; y < 13; y++) {
      for (let x = 0; x < 13; x++) {
        const d = Math.hypot(x - 6, y - 6);
        if (d > 6.3) continue;
        px(x, y, d > 5.3 ? ink : `rgb(${skin.map((v) => (x + y > 15 ? v * 0.88 : v))})`);
      }
    }
    if (look.blush) both(look.blush, `rgba(240, 110, 140, ${0.7 * (joy ? 1 : rel)})`);
    if (shock) { px(4, 5, "#fff"); px(8, 5, "#fff"); }
    both(look.eye, ink);
    both(look.brow, ink);
    if (look.teeth) {
      for (let x = 4; x <= 8; x++) { px(x, 8, ink); px(x, 11, ink); px(x, 9, "#fff"); px(x, 10, "#fff"); }
      both([[3, 9], [3, 10], [5, 9], [5, 10]], ink);
    } else {
      for (const [x, y] of look.mouth) px(x, y, ink);
    }
    if (look.tear) both(look.tear, "#9fd4f5");
    if (look.vein) for (const [x, y] of look.vein) px(x, y, "#c42c2c");
    if (st > 0.35 && !shock) {
      c.globalAlpha = Math.min(1, (st - 0.35) / 0.4);
      for (const [x, y] of [[11, 1], [10, 2], [11, 2], [10, 3], [11, 3]]) px(x, y, "#9fd4f5");
      c.globalAlpha = 1;
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
    if (!X) els.time.textContent = Math.ceil(CFG.duration - state.time);
    els.best.textContent = best();
  }

  // Grid size, buffers and the soft wall shapes for the mode being mounted.
  function setup(opts) {
    mode = opts;
    KEY = opts.id;
    X = !!opts.expanded;
    W = X ? CFG.wide : 41;
    CX = (W - 1) / 2;
    OPEN = new Uint8Array(W * H);
    CYL = new Uint8Array(W * H);
    FOOT = new Uint8Array(W * H);
    BASE = new Uint8ClampedArray(W * H * 4);
    KIND = new Uint8Array(W * H);
    DEPTH = new Uint8Array(W * H);
    WL = new Int16Array(H);
    WR = new Int16Array(H);
    DL = new Int16Array(H);
    DR = new Int16Array(H);
    FTOP = new Int16Array(W).fill(H);
    DF = new Int16Array(W);
    SW = new Int8Array(VALVE + 1);
    seen = new Uint32Array(W * H);
    squeeze = 0;
    ground = "pink";
    if (!X) return;
    gap = Math.max(CFG.gapMin, Math.min(CFG.gapMax, ctx.storage.get(KEY + ":gap", CFG.wallGap)));
    ground = ctx.storage.get(KEY + ":ground", "pink") === "orange" ? "orange" : "pink";
    pourMode = ctx.storage.get(KEY + ":pour", "auto") === "rub" ? "rub" : "auto";
    terrain();
  }

  // Side walls and the top of the floor for the chosen floor.
  function terrain() {
    walls();
    FTOP.fill(H);
    for (let x = 0; x < W; x++) {
      if (ground === "orange") FTOP[x] = VALVE + CFG.floorTop;
      else for (let y = VALVE + 1; y < H; y++) if (!openBelow(x, y)) { FTOP[x] = y; break; }
    }
  }

  function mount(container, context, opts) {
    ctx = context;
    root = container;
    setup(opts);
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
      state.drag = { px: e.clientX, py: e.clientY, ox: OX, oy: OY };
      e.preventDefault();
    });
    els.box.addEventListener("pointermove", (e) => {
      const g = state.drag;
      if (!X || !g || state.pointer !== e.pointerId) return;
      const cell = els.canvas.clientWidth / W;
      state.aim.x = g.ox + Math.round((e.clientX - g.px) / cell);
      state.aim.y = g.oy + Math.round((e.clientY - g.py) / cell);
      rub(Math.hypot(e.movementX || 0, (e.movementY || 0) * CFG.rubVert) / cell);
    });
    const onUp = (e) => {
      if (state.pointer !== e.pointerId) return;
      state.pointer = null;
      state.holding = false;
      state.drag = null;
    };
    els.box.addEventListener("pointerup", onUp);
    els.box.addEventListener("pointercancel", onUp);
    els.box.addEventListener("contextmenu", (e) => e.preventDefault());
    els.feed.addEventListener("input", () => { state.feed = els.feed.value / 100; });
    els.flow.addEventListener("input", () => { state.flow = els.flow.value / 100; });
    flowOn = true;
    const showFlow = () => { els.stopBtn.textContent = flowOn ? "⏹ Durdur" : "▶ Aç"; };
    const toggleFlow = () => { flowOn = !flowOn; showFlow(); };
    showFlow();
    els.stopBtn.addEventListener("click", toggleFlow);
    if (X) {
      const showModes = () => {
        els.groundBtn.textContent = "Zemin: " + (ground === "orange" ? "Turuncu" : "Pembe");
        els.pourBtn.textContent = "Akış: " + (pourMode === "rub" ? "Sürtünmeye Bağlı" : "Otomatik");
        els.gapRow.style.display = ground === "orange" ? "none" : "";
      };
      showModes();
      els.groundBtn.addEventListener("click", () => {
        ground = ground === "orange" ? "pink" : "orange";
        ctx.storage.set(KEY + ":ground", ground);
        const s = state;
        for (const a of [DL, DR, DF, s.dl, s.dr, s.df, s.over]) a.fill(0);
        s.bend = [0, 0];
        terrain();
        fit(dents(OX, OY), 0);
        reshape(s.tip);
        showModes();
        render();
      });
      els.pourBtn.addEventListener("click", () => {
        pourMode = pourMode === "rub" ? "auto" : "rub";
        ctx.storage.set(KEY + ":pour", pourMode);
        showModes();
      });
      els.gap.addEventListener("input", () => {
        gap = +els.gap.value;
        ctx.storage.set(KEY + ":gap", gap);
        walls();
        fit(dents(OX, OY), 0);
        reshape(state.tip);
        render();
      });
      els.squeeze.addEventListener("input", () => {
        squeeze = +els.squeeze.value;
        reshape(state.tip);
        render();
      });
    }
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
      const live = state.playing && !state.paused;
      if (confirm && live) state.holding = !state.burst;
      else if (confirm && state.paused) resume();
      else if (confirm && !state.playing && overlayOpen()) play();
      else if (X && live && (k === "a" || k === "d")) { state.aim.x = OX + (k === "d" ? 1 : -1); rub(1); }
      else if (X && live && (k === "w" || k === "s")) { state.aim.y = OY + (k === "s" ? 1 : -1); rub(CFG.rubVert); }
      else if (k === "f") toggleFlow();
      else if (X && (e.target === els.gap || e.target === els.squeeze) && k.startsWith("arrow")) return;
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
    { icon: "🚰", title: "Akış", text: "<b>Akış</b> barını sağa çektikçe yukarıdan daha çok sıvı akar: silindir hızlı dolar, sıkıştırdığında beyaz hızlı artar. Ama basınç da hızlanır, bırakınca da sıvı taşabilir. PC'de <b>↑ ↓</b> tuşları da olur. Yanındaki <b>Durdur</b> butonu (PC'de <b>F</b>) akışı tamamen keser, tekrar basınca açar." },
    { icon: "🎚️", title: "Yoğunluk", text: "Alttaki barı <b>sağa</b> çektikçe yukarıdan akan sıvı daha yoğun gelir ve beyaz daha hızlı artar. Ama yoğun sıvı daha sert iter: <b>basınç</b> da o kadar hızlı yükselir. PC'de <b>← →</b> tuşları da olur." },
    { icon: "🌊", title: "Bırak", text: "Bırakınca biriken basınç sıvıyı uçtan dışarı <b>iter</b> ve basınç bitene kadar silindir boşalır, yerine saydam sıvı gelir. Basınç yüksekse yoğun sıvı bile hızla fışkırır. Basınç azaldıkça yoğun sıvı ağırlaşır, <b>damla damla</b>, tortu gibi süzülür." },
    { icon: "🏆", title: "Puan", text: "Tur <b>60 saniye</b>. Süre bitince beyazlık kadar puan alırsın (en fazla 1000). Bembeyaza ulaşırsan kalan süre kadar bonus kazanırsın." },
  ];

  const SOFT = [
    { icon: "🤚", title: "Sürükle", text: "Basılı tutarken parmağını ya da fareni <b>sürükleyerek</b> silindiri sağa sola ve aşağı oynat. PC'de <b>A D</b> ile yana, <b>W S</b> ile yukarı aşağı. Yana çektikçe silindirin ucu geride kalıp <b>sallanır</b>. Tutarak sürükledikçe akan sıvı <b>yoğunlaşır</b> ve köşedeki yüz keyiflenir." },
    { icon: "🍬", title: "Yumuşak duvarlar", text: "Yanlardaki kıvrımlı <b>pembe duvarlar</b> yumuşaktır: silindiri bastırınca <b>içe çöker</b>, bırakınca yavaşça eski hâline döner. Zemin serttir; yalnızca kasenin üstündeki iki tabağın <b>uçları</b> kol gibi aşağı bükülür, silindirle zorlayabilirsin. Zemine dökülen sıvı ise pembenin içine emilir. <b>Duvar</b> barıyla pembe duvarları silindire yaklaştırıp uzaklaştırabilirsin." },
    { icon: "🫳", title: "Esnek silindir", text: "Silindir deri gibi kıvrımlı ve esnektir. <b>Daralt</b> barını sağa çektikçe silindirin içi <b>daralır</b>. Sıkışan sıvı silindirde kalan sıvıya basılır ve onu <b>yoğunlaştırır</b>." },
    { icon: "🟧", title: "Zemin", text: "<b>Zemin</b> butonuyla zemini değiştir. <b>Pembe</b>: kıvrımlı duvarlar, tabaklar ve kase. <b>Turuncu</b>: yalnızca altta yumuşak bir zemin; silindiri bastırdıkça çöker, dökülen sıvıyı emer." },
    { icon: "🔁", title: "Akış modu", text: "<b>Otomatik</b>: sıvı sürekli akar. <b>Sürtünmeye Bağlı</b>: sıvı yalnızca silindiri basılı tutup <b>sürükledikçe</b> akar; ne kadar sürtersen o kadar akar." },
    { icon: "😣", title: "Yüz", text: "Sağ üst köşedeki yüz basıncı gösterir: basınç arttıkça <b>gerilir</b>, kızarır, terler. Bırakıp boşalttığında <b>rahatlar</b>. Boşalırken yeniden basılı tutup yarıda kesersen <b>iyice sinirlenir</b>." },
  ];

  const NO_TIME = { icon: "🏆", title: "Puan", text: "Süre yok, istediğin kadar oyna. Sıvıyı <b>bembeyaza</b> ulaştırınca tur biter: 1000 puan alırsın, ilk 60 saniyede bitirirsen kalan süre kadar <b>bonus</b> da kazanırsın." };

  const BURST_ON = { icon: "💥", title: "Basınç", text: "Tuttuğun sürece basınç yükselir, sıvı beyazladıkça daha da hızlı yükselir. Basınç tepeye vurursa uç <b>fışkırır</b>, silindir boşalır ve basınç sıfırlanır. Tur bitmez, <b>devam edersin</b>." };

  function create(opts) {
    return {
      id: opts.id,
      family: "presia",
      name: opts.name,
      emoji: opts.emoji,
      desc: opts.desc,
      guide: opts.guide,
      mount: (container, context) => mount(container, context, opts),
      unmount,
      pause,
    };
  }

  MG.family({ id: "presia", name: "Presia", emoji: "🧪", desc: "Sıvıyı tut, sıkıştır, bembeyaz yap." });

  MG.register(create({
    id: "presia",
    name: "Presia 1.0",
    emoji: "🧪",
    desc: "Sıvıyı tut, sıkıştır, bembeyaz yap.",
    intro: "Silindiri doldur, alt ucu basılı tutarak kapat, sıvıyı saydamdan bembeyaza kadar sıkıştır.",
    hint: "Çizgiye gelince basılı tut. Barları sağa çektikçe beyaz hızlanır ama basınç da hızlanır.",
    guide: GUIDE,
  }));

  MG.register(create({
    id: "presia-expanded",
    name: "Presia 1.1",
    emoji: "🩷",
    desc: "Yumuşak pembe duvarlar arasında silindiri oynat.",
    intro: "Silindiri tut ve sürükle: kıvrımlı pembe duvarlar ve zemin yumuşaktır, bastırdıkça içe çöker.",
    hint: "Çizgiye gelince basılı tut. Tutarken sürükleyerek silindiri oynat, pembe duvarlara ve zemine bastır.",
    expanded: true,
    guide: [...GUIDE.slice(0, 3), ...SOFT, BURST_ON, ...GUIDE.slice(4, 7), NO_TIME],
  }));
})();
