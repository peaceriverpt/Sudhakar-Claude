/* =========================================================================
   Pac-Man — a self-contained HTML5 canvas game.
   No external libraries, no build step, no server. Just a static page.
   ========================================================================= */

(() => {
  'use strict';

  // ---- Maze ---------------------------------------------------------------
  // Legend:  # wall   . pellet   o power pellet   ' ' empty   - ghost-house door
  // The board is 28 columns x 31 rows (the classic Pac-Man dimensions).
  const MAZE = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.#####.##.#####.######',
    '######.#####.##.#####.######',
    '######.##..........##.######',
    '######.##.###--###.##.######',
    '######.##.#      #.##.######',
    '          #      #          ',
    '######.##.#      #.##.######',
    '######.##.########.##.######',
    '######.##..........##.######',
    '######.#####.##.#####.######',
    '######.#####.##.#####.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##.......  .......##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];

  const ROWS = MAZE.length;      // 31
  const COLS = MAZE[0].length;   // 28
  const TILE = 16;               // pixel size of one maze tile
  const HALF = TILE / 2;

  // The single horizontal wrap-around tunnel row.
  const TUNNEL_ROW = 14;

  // Spawn positions (col, row) chosen to sit on open corridors.
  const PAC_SPAWN = { col: 13, row: 23 };
  const GHOST_SPAWN = {
    blinky: { col: 13, row: 11 },
    pinky:  { col: 13, row: 17 },
    inky:   { col: 9,  row: 11 },
    clyde:  { col: 18, row: 11 },
  };
  // Scatter-mode home corners for each ghost.
  const SCATTER = {
    blinky: { col: 26, row: 1 },
    pinky:  { col: 1,  row: 1 },
    inky:   { col: 26, row: 29 },
    clyde:  { col: 1,  row: 29 },
  };

  // ---- Grid state ---------------------------------------------------------
  // grid[row][col] holds the current cell type; pellets get cleared as eaten.
  let grid, pelletsLeft;

  function buildGrid() {
    grid = MAZE.map((line) => line.split(''));
    // Clear pellets that sit on spawn tiles so nobody starts on food.
    grid[PAC_SPAWN.row][PAC_SPAWN.col] = ' ';
    pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        if (ch === '.' || ch === 'o') pelletsLeft++;
      }
    }
  }

  const isWall = (r, c) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
    const ch = grid[r][c];
    return ch === '#' || ch === '-';
  };

  // ---- Directions ---------------------------------------------------------
  const DIRS = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1,  y: 0 },
    none:  { x: 0,  y: 0 },
  };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left', none: 'none' };

  const toPixel = (col, row) => ({ x: col * TILE + HALF, y: row * TILE + HALF });
  const atCenter = (e) => ((e.x - HALF) % TILE === 0) && ((e.y - HALF) % TILE === 0);
  const tileOf = (e) => ({ col: Math.floor(e.x / TILE), row: Math.floor(e.y / TILE) });

  // ---- Game objects -------------------------------------------------------
  const SPEED = 2;             // pac / ghost pixels per tick (divides TILE)
  const FRIGHT_SPEED = 1;      // slower when frightened
  const EYE_SPEED = 4;         // fast return to house

  let pac, ghosts, score, lives, level, best;
  let mode, modeTimer, frightTimer, ghostsEaten;
  let state; // 'ready' | 'playing' | 'dying' | 'levelclear' | 'gameover'
  let stateTimer;

  best = Number(localStorage.getItem('pacman-best') || 0);

  function makePac() {
    const p = toPixel(PAC_SPAWN.col, PAC_SPAWN.row);
    return { x: p.x, y: p.y, dir: 'left', next: 'left', mouth: 0, mouthDir: 1 };
  }

  function makeGhost(name, color) {
    const s = GHOST_SPAWN[name];
    const p = toPixel(s.col, s.row);
    return {
      name, color,
      x: p.x, y: p.y,
      dir: 'up', spawn: s,
      state: 'normal', // 'normal' | 'frightened' | 'eyes'
    };
  }

  function resetActors() {
    pac = makePac();
    ghosts = [
      makeGhost('blinky', '#ff0000'),
      makeGhost('pinky',  '#ffb8ff'),
      makeGhost('inky',   '#00ffff'),
      makeGhost('clyde',  '#ffb851'),
    ];
    mode = 'scatter';
    modeTimer = 7 * 60;   // frames
    frightTimer = 0;
    ghostsEaten = 0;
  }

  function newGame() {
    buildGrid();
    score = 0;
    lives = 3;
    level = 1;
    resetActors();
    setState('ready', 90);
  }

  function setState(s, timer) {
    state = s;
    stateTimer = timer || 0;
  }

  // ---- Sound --------------------------------------------------------------
  // All sounds are synthesized with the Web Audio API so the game stays a
  // single self-contained page with no audio files to load.
  const Sound = (() => {
    let ctx = null;
    let muted = localStorage.getItem('pacman-muted') === '1';
    let wakaHigh = false;

    function ac() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      return ctx;
    }

    // Browsers block audio until the first user gesture; call this on input.
    function resume() {
      const c = ac();
      if (c && c.state === 'suspended') c.resume();
    }

    // Play one note. `slideTo` bends the pitch over the note's duration.
    function note(freq, dur, { type = 'square', vol = 0.14, slideTo = null, delay = 0 } = {}) {
      if (muted) return;
      const c = ac();
      if (!c) return;
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    }

    return {
      resume,
      isMuted: () => muted,
      setMuted(m) {
        muted = m;
        localStorage.setItem('pacman-muted', m ? '1' : '0');
      },
      // The classic "waka-waka": alternate two short chomps as pellets vanish.
      munch() {
        wakaHigh = !wakaHigh;
        note(wakaHigh ? 523 : 392, 0.05, { type: 'square', vol: 0.1 });
      },
      // Eating a power pellet.
      power() {
        note(180, 0.3, { type: 'sawtooth', vol: 0.14, slideTo: 90 });
      },
      // Eating a frightened ghost.
      eatGhost() {
        note(180, 0.08, { type: 'square', vol: 0.16 });
        note(360, 0.12, { type: 'square', vol: 0.16, delay: 0.08 });
        note(720, 0.16, { type: 'square', vol: 0.16, delay: 0.2 });
      },
      // Pac-Man caught by a ghost: a descending wail.
      death() {
        note(500, 0.18, { type: 'sawtooth', vol: 0.2, slideTo: 300 });
        note(360, 0.22, { type: 'sawtooth', vol: 0.2, slideTo: 180, delay: 0.2 });
        note(220, 0.4, { type: 'sawtooth', vol: 0.2, slideTo: 60, delay: 0.44 });
      },
    };
  })();

  // ---- Input --------------------------------------------------------------
  function setDir(d) {
    Sound.resume(); // unlock audio on the first interaction
    if (state === 'gameover') { newGame(); return; }
    pac.next = d;
  }

  window.addEventListener('keydown', (e) => {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right',
    };
    if (map[e.key]) { e.preventDefault(); setDir(map[e.key]); }
    if (e.key === ' ' && state === 'gameover') newGame();
    if (e.key === 'm' || e.key === 'M') toggleMute();
  });

  // Mute button + keyboard toggle.
  const muteBtn = document.getElementById('mute');
  function refreshMuteBtn() {
    if (muteBtn) {
      muteBtn.textContent = Sound.isMuted() ? '🔇' : '🔊';
      muteBtn.setAttribute('aria-pressed', String(Sound.isMuted()));
    }
  }
  function toggleMute() {
    Sound.resume();
    Sound.setMuted(!Sound.isMuted());
    refreshMuteBtn();
  }
  if (muteBtn) {
    const fire = (e) => { e.preventDefault(); toggleMute(); };
    muteBtn.addEventListener('click', fire);
    muteBtn.addEventListener('touchstart', fire, { passive: false });
  }
  refreshMuteBtn();

  // Touch / swipe controls for mobile.
  let touchStart = null;
  const canvasEl = document.getElementById('game');
  const handleTouchStart = (e) => { const t = e.touches[0]; touchStart = { x: t.clientX, y: t.clientY }; };
  const handleTouchMove = (e) => {
    if (!touchStart) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
    touchStart = { x: t.clientX, y: t.clientY };
  };
  canvasEl.addEventListener('touchstart', handleTouchStart, { passive: true });
  canvasEl.addEventListener('touchmove', handleTouchMove, { passive: false });

  // On-screen D-pad buttons (present in the HTML).
  document.querySelectorAll('[data-dir]').forEach((btn) => {
    const fire = (e) => { e.preventDefault(); setDir(btn.getAttribute('data-dir')); };
    btn.addEventListener('click', fire);
    btn.addEventListener('touchstart', fire, { passive: false });
  });

  // ---- Movement helpers ---------------------------------------------------
  function canMove(e, dir, speed) {
    const d = DIRS[dir];
    // Look at the tile we'd be entering.
    const nx = e.x + d.x * HALF;
    const ny = e.y + d.y * HALF;
    const col = Math.floor((nx + d.x * (speed - 1)) / TILE);
    const row = Math.floor((ny + d.y * (speed - 1)) / TILE);
    return !isWall(row, col);
  }

  function wrap(e) {
    if (e.x < -HALF) e.x = COLS * TILE - HALF;
    else if (e.x > COLS * TILE - HALF) e.x = -HALF;
  }

  // ---- Pac-Man update -----------------------------------------------------
  function updatePac() {
    // Animate mouth.
    pac.mouth += 0.18 * pac.mouthDir;
    if (pac.mouth > 1) { pac.mouth = 1; pac.mouthDir = -1; }
    if (pac.mouth < 0) { pac.mouth = 0; pac.mouthDir = 1; }

    if (atCenter(pac)) {
      // Try to take the queued turn.
      if (pac.next !== pac.dir && canMove(pac, pac.next, SPEED)) {
        pac.dir = pac.next;
      }
      // Stop if the current direction is blocked.
      if (!canMove(pac, pac.dir, SPEED)) {
        return; // idle against the wall
      }
    }

    const d = DIRS[pac.dir];
    pac.x += d.x * SPEED;
    pac.y += d.y * SPEED;
    wrap(pac);

    // Eat whatever is on the tile we've centered on.
    if (atCenter(pac)) {
      const { col, row } = tileOf(pac);
      const ch = grid[row][col];
      if (ch === '.') {
        grid[row][col] = ' ';
        score += 10;
        pelletsLeft--;
        Sound.munch();
      } else if (ch === 'o') {
        grid[row][col] = ' ';
        score += 50;
        pelletsLeft--;
        Sound.power();
        enterFrightened();
      }
      if (pelletsLeft <= 0) setState('levelclear', 120);
    }
  }

  // ---- Ghost update -------------------------------------------------------
  function enterFrightened() {
    frightTimer = 7 * 60; // ~7 seconds
    ghostsEaten = 0;
    for (const g of ghosts) {
      if (g.state === 'normal') {
        g.state = 'frightened';
        g.dir = OPPOSITE[g.dir]; // classic reverse on power pellet
      }
    }
  }

  function ghostTarget(g) {
    const pacTile = tileOf(pac);
    if (mode === 'scatter') return SCATTER[g.name];

    switch (g.name) {
      case 'blinky':
        return pacTile;
      case 'pinky': {
        const d = DIRS[pac.dir];
        return { col: pacTile.col + d.x * 4, row: pacTile.row + d.y * 4 };
      }
      case 'inky': {
        const blinky = ghosts[0];
        const bt = tileOf(blinky);
        const d = DIRS[pac.dir];
        const ax = pacTile.col + d.x * 2;
        const ay = pacTile.row + d.y * 2;
        return { col: ax + (ax - bt.col), row: ay + (ay - bt.row) };
      }
      case 'clyde': {
        const dist = Math.hypot(pacTile.col - tileOf(g).col, pacTile.row - tileOf(g).row);
        return dist > 8 ? pacTile : SCATTER.clyde;
      }
      default:
        return pacTile;
    }
  }

  function chooseGhostDir(g, speed) {
    const here = tileOf(g);
    const target = g.state === 'eyes'
      ? { col: GHOST_SPAWN.blinky.col, row: GHOST_SPAWN.blinky.row }
      : ghostTarget(g);

    const options = [];
    for (const dir of ['up', 'left', 'down', 'right']) {
      if (dir === OPPOSITE[g.dir]) continue;   // ghosts never reverse voluntarily
      if (!canMove(g, dir, speed)) continue;
      const d = DIRS[dir];
      const nc = here.col + d.x, nr = here.row + d.y;
      const dist = (nc - target.col) ** 2 + (nr - target.row) ** 2;
      options.push({ dir, dist });
    }
    if (options.length === 0) {
      // Dead end: allow reversing.
      g.dir = OPPOSITE[g.dir];
      return;
    }
    if (g.state === 'frightened') {
      // Wander pseudo-randomly (seeded by position so it stays deterministic-ish).
      const pick = options[(here.col + here.row + Math.floor(g.x + g.y)) % options.length];
      g.dir = pick.dir;
      return;
    }
    options.sort((a, b) => a.dist - b.dist);
    g.dir = options[0].dir;
  }

  function updateGhost(g) {
    let speed = SPEED;
    if (g.state === 'frightened') speed = FRIGHT_SPEED;
    if (g.state === 'eyes') speed = EYE_SPEED;

    if (atCenter(g)) {
      // Eyes that reached the house turn back into a normal ghost.
      const t = tileOf(g);
      if (g.state === 'eyes' && t.col === GHOST_SPAWN.blinky.col && t.row === GHOST_SPAWN.blinky.row) {
        g.state = 'normal';
      }
      chooseGhostDir(g, speed);
    }
    const d = DIRS[g.dir];
    g.x += d.x * speed;
    g.y += d.y * speed;
    wrap(g);
  }

  function updateGhosts() {
    // Scatter / chase schedule.
    if (frightTimer > 0) {
      frightTimer--;
      if (frightTimer === 0) {
        for (const g of ghosts) if (g.state === 'frightened') g.state = 'normal';
      }
    } else {
      modeTimer--;
      if (modeTimer <= 0) {
        mode = mode === 'scatter' ? 'chase' : 'scatter';
        modeTimer = (mode === 'scatter' ? 7 : 20) * 60;
        // Reverse direction on mode switch (classic behavior).
        for (const g of ghosts) if (g.state === 'normal') g.dir = OPPOSITE[g.dir];
      }
    }

    for (const g of ghosts) updateGhost(g);
  }

  // ---- Collisions ---------------------------------------------------------
  function checkCollisions() {
    const pt = tileOf(pac);
    for (const g of ghosts) {
      const gt = tileOf(g);
      if (gt.col === pt.col && gt.row === pt.row) {
        if (g.state === 'frightened') {
          g.state = 'eyes';
          ghostsEaten++;
          score += 200 * Math.pow(2, ghostsEaten - 1); // 200,400,800,1600
          Sound.eatGhost();
        } else if (g.state === 'normal') {
          loseLife();
          return;
        }
      }
    }
  }

  function loseLife() {
    lives--;
    Sound.death();
    if (score > best) { best = score; localStorage.setItem('pacman-best', String(best)); }
    setState('dying', 60);
  }

  // ---- Main update --------------------------------------------------------
  function update() {
    if (state === 'ready') {
      if (--stateTimer <= 0) setState('playing');
      return;
    }
    if (state === 'dying') {
      if (--stateTimer <= 0) {
        if (lives <= 0) {
          if (score > best) { best = score; localStorage.setItem('pacman-best', String(best)); }
          setState('gameover');
        } else {
          resetActors();
          setState('ready', 60);
        }
      }
      return;
    }
    if (state === 'levelclear') {
      if (--stateTimer <= 0) {
        level++;
        buildGrid();
        resetActors();
        setState('ready', 60);
      }
      return;
    }
    if (state !== 'playing') return;

    updatePac();
    if (state !== 'playing') return; // level might have cleared
    updateGhosts();
    checkCollisions();
    if (score > best) { best = score; localStorage.setItem('pacman-best', String(best)); }
  }

  // ---- Rendering ----------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;

  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#1919ff';
          ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = '#0a0a3a';
          ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
        } else if (ch === '-') {
          ctx.fillStyle = '#ffb8ff';
          ctx.fillRect(x, y + HALF - 2, TILE, 4);
        } else if (ch === '.') {
          ctx.fillStyle = '#ffb897';
          ctx.beginPath();
          ctx.arc(x + HALF, y + HALF, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === 'o') {
          ctx.fillStyle = '#ffb897';
          ctx.beginPath();
          ctx.arc(x + HALF, y + HALF, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPac() {
    const angleByDir = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const base = angleByDir[pac.dir] || 0;
    const open = 0.25 * Math.PI * pac.mouth;
    ctx.save();
    ctx.translate(pac.x, pac.y);
    ctx.rotate(base);
    ctx.fillStyle = '#ffe100';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, HALF - 1, open, Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGhost(g) {
    const x = g.x, y = g.y, radius = HALF - 1;
    let body = g.color;
    if (g.state === 'frightened') {
      // Flash white when frightened time is almost up.
      const flashing = frightTimer < 120 && Math.floor(frightTimer / 15) % 2 === 0;
      body = flashing ? '#ffffff' : '#2121ff';
    }

    if (g.state !== 'eyes') {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, radius, Math.PI, 0);
      ctx.lineTo(x + radius, y + radius);
      // wavy skirt
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const wx = x + radius - (i * 2 + 1) * (radius / steps);
        ctx.lineTo(wx, y + radius - (i % 2 === 0 ? 4 : 0));
      }
      ctx.lineTo(x - radius, y + radius);
      ctx.closePath();
      ctx.fill();
    }

    // Eyes
    const look = DIRS[g.dir];
    const drawEye = (ex) => {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, y - 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g.state === 'frightened' ? '#2121ff' : '#0a0a3a';
      ctx.beginPath();
      ctx.arc(ex + look.x * 1.6, y - 2 + look.y * 1.6, 1.6, 0, Math.PI * 2);
      ctx.fill();
    };
    drawEye(x - 3.5);
    drawEye(x + 3.5);
  }

  function drawHUD() {
    const scoreEl = document.getElementById('score');
    const bestEl = document.getElementById('best');
    const livesEl = document.getElementById('lives');
    const levelEl = document.getElementById('level');
    if (scoreEl) scoreEl.textContent = score;
    if (bestEl) bestEl.textContent = best;
    if (livesEl) livesEl.textContent = '●'.repeat(Math.max(0, lives));
    if (levelEl) levelEl.textContent = level;
  }

  function drawOverlay() {
    const msg = document.getElementById('overlay');
    if (!msg) return;
    let text = '';
    if (state === 'ready') text = 'READY!';
    else if (state === 'levelclear') text = 'LEVEL CLEAR!';
    else if (state === 'gameover') text = 'GAME OVER — press Space / tap to restart';
    msg.textContent = text;
    msg.style.display = text ? 'block' : 'none';
    msg.className = state === 'gameover' ? 'overlay gameover' : 'overlay';
  }

  function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    if (state !== 'dying') drawPac();
    else {
      // shrink animation
      const t = 1 - stateTimer / 60;
      ctx.save();
      ctx.translate(pac.x, pac.y);
      ctx.fillStyle = '#ffe100';
      ctx.beginPath();
      ctx.arc(0, 0, (HALF - 1) * (1 - t), Math.PI * t, Math.PI * (2 - t));
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
    }
    for (const g of ghosts) drawGhost(g);
    drawHUD();
    drawOverlay();
  }

  // ---- Loop (fixed 60Hz logic) -------------------------------------------
  let acc = 0, last = 0;
  const STEP = 1000 / 60;
  function loop(now) {
    if (!last) last = now;
    acc += now - last;
    last = now;
    // Clamp to avoid spiral-of-death after a tab is backgrounded.
    if (acc > 200) acc = 200;
    while (acc >= STEP) {
      update();
      acc -= STEP;
    }
    render();
    requestAnimationFrame(loop);
  }

  newGame();
  requestAnimationFrame(loop);
})();
