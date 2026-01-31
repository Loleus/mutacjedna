// --- Parametry / stałe rysowania ---
const W = 280, H = 280;
const WALL_THICK = 5;

// stałe rozmiary markerów niezależne od poprzedniego rozmiaru
const START_R = 6;   // promień kropki start (i wizualnie też znacznika startu)
const AGENT_R = 3;   // promień agenta

// start i goal ustawione bezpośrednio w narożnikach nowego canvasa
const start = { x: WALL_THICK + START_R, y: H - WALL_THICK - START_R };
const goal = { x: W - WALL_THICK - START_R, y: WALL_THICK + START_R, r: 12 };
const START_TO_GOAL_DIST = Math.hypot(start.x - goal.x, start.y - goal.y);

// --- Parametry ewolucji / symulacji ---
const POP_SIZE = 100;
let HIDDEN = 8;
let MUT_RATE = 0.08;
let ELITE_COUNT = 5;

const STEP_LIMIT = 1200;
const SPEED = 1.8;

// --- Canvas ---
const cv = document.getElementById('cv');
cv.width = W;
cv.height = H;
const ctx = cv.getContext('2d');

// --- UI ---
const popEl = document.getElementById('pop');
const genEl = document.getElementById('gen');
const bestEl = document.getElementById('best');
const hiddenEl = document.getElementById('hidden');
const hiddenValEl = document.getElementById('hiddenVal');
const mutRateEl = document.getElementById('mutRate');
const mutRateValEl = document.getElementById('mutRateVal');
const eliteEl = document.getElementById('elite');
const eliteValEl = document.getElementById('eliteVal');
const btnRestart = document.getElementById('restart');
const btnPause = document.getElementById('pause');

const tourSizeEl = document.getElementById('tourSize');
const tourSizeValEl = document.getElementById('tourSizeVal');
const tourNoRepeatEl = document.getElementById('tourNoRepeat');

let TOUR_SIZE = 5;
let TOUR_NO_REPEAT = false;

popEl.textContent = POP_SIZE;

hiddenEl.oninput = () => {
  HIDDEN = +hiddenEl.value;
  hiddenValEl.textContent = HIDDEN;
  resetPopulation(true);
};

mutRateEl.oninput = () => {
  MUT_RATE = +mutRateEl.value / 100;
  mutRateValEl.textContent = Math.round(MUT_RATE * 100) + '%';
};

eliteEl.oninput = () => {
  ELITE_COUNT = +eliteEl.value;
  eliteValEl.textContent = ELITE_COUNT;
};

tourSizeEl.oninput = () => {
  TOUR_SIZE = +tourSizeEl.value;
  tourSizeValEl.textContent = TOUR_SIZE;
};

tourNoRepeatEl.onchange = () => {
  TOUR_NO_REPEAT = tourNoRepeatEl.checked;
};

btnRestart.onclick = () => resetPopulation(true);

let paused = false;
btnPause.onclick = () => {
  paused = !paused;
  btnPause.textContent = paused ? 'Wznów' : 'Pauza';
};

// --- Labirynt (bez stałych liczb poza ułamkami W/H + WALL_THICK) ---
const walls = [
  { x: 0, y: 0, w: W, h: WALL_THICK },
  { x: 0, y: H - WALL_THICK, w: W, h: WALL_THICK },
  { x: 0, y: 0, w: WALL_THICK, h: H },
  { x: W - WALL_THICK, y: 0, w: WALL_THICK, h: H },

  // wewnętrzne, prosty układ w środku canvasu
  { x: Math.round(W * 0.2), y: Math.round(H * 0.2), w: Math.round(W * 0.6), h: WALL_THICK },
  { x: Math.round(W * 0.2), y: Math.round(H * 0.2), w: WALL_THICK, h: Math.round(H * 0.6) },
  { x: Math.round(W * 0.4), y: Math.round(H * 0.55), w: Math.round(W * 0.4), h: WALL_THICK },
  { x: Math.round(W * 0.7), y: Math.round(H * 0.2), w: WALL_THICK, h: Math.round(H * 0.4) },
];

function drawMaze() {
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, W, H);

  // goal
  ctx.beginPath();
  ctx.fillStyle = '#2ecc71';
  ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
  ctx.fill();

  // start marker (stały rozmiar)
  ctx.beginPath();
  ctx.fillStyle = '#3498db';
  ctx.arc(start.x, start.y, START_R, 0, Math.PI * 2);
  ctx.fill();

  // ściany
  ctx.fillStyle = '#777';
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
}

// LOGICZNO-MATEMATYCZNA POPRAWKA:
// - wcześniej collides() dublowało sprawdzanie ramki (były i ściany zewnętrzne, i osobny if na granice).
// - zostawiamy tylko test kolizji z prostokątami (w tym ramką), a dodatkowy if usuwamy.
// - używamy r = AGENT_R (spójny promień agenta).
function collides(x, y, r = AGENT_R) {
  for (const w of walls) {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const ny = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

// --- Sieć neuronowa ---
function randn() {
  const u = Math.random(), v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

class Net {
  constructor(inDim = 6, hiddenDim = HIDDEN, outDim = 2, weights = null) {
    this.inDim = inDim; this.hiddenDim = hiddenDim; this.outDim = outDim;
    if (weights) {
      this.W1 = weights.W1; this.b1 = weights.b1;
      this.W2 = weights.W2; this.b2 = weights.b2;
    } else {
      this.W1 = Array.from({ length: hiddenDim }, () =>
        Array.from({ length: inDim }, () => randn() * 0.3)
      );
      this.b1 = Array.from({ length: hiddenDim }, () => 0);
      this.W2 = Array.from({ length: outDim }, () =>
        Array.from({ length: hiddenDim }, () => randn() * 0.3)
      );
      this.b2 = Array.from({ length: outDim }, () => 0);
    }
  }
  forward(x) {
    const h = new Array(this.hiddenDim).fill(0);
    for (let i = 0; i < this.hiddenDim; i++) {
      let s = this.b1[i];
      for (let j = 0; j < this.inDim; j++) s += this.W1[i][j] * x[j];
      h[i] = s > 0 ? s : 0; // ReLU
    }
    const y = new Array(this.outDim).fill(0);
    for (let i = 0; i < this.outDim; i++) {
      let s = this.b2[i];
      for (let j = 0; j < this.hiddenDim; j++) s += this.W2[i][j] * h[j];
      y[i] = Math.tanh(s);
    }
    return y;
  }
  copyWeights() {
    return {
      W1: this.W1.map(row => [...row]),
      b1: [...this.b1],
      W2: this.W2.map(row => [...row]),
      b2: [...this.b2],
    };
  }
}

// --- Sensory ---
// LOGICZNO-MATEMATYCZNA POPRAWKA:
// - dystans z raycastu normalizujemy do [0,1] względem maksymalnego możliwego zasięgu w tej scenie (diagonalna).
// - w przeciwnym razie po zmianie W/H skala wejść drastycznie się zmienia.
const RAY_STEP = 3;
const RAY_MAX_DIST = Math.hypot(W, H);
const RAY_MAX_STEPS = Math.ceil(RAY_MAX_DIST / RAY_STEP);

function rayDistance(x, y, dir) {
  let d = 0;
  let cx = x, cy = y;
  for (let k = 0; k < RAY_MAX_STEPS; k++) {
    cx += dir[0] * RAY_STEP;
    cy += dir[1] * RAY_STEP;
    d += RAY_STEP;
    if (collides(cx, cy, AGENT_R)) break;
  }
  return Math.min(1, d / RAY_MAX_DIST);
}

function sensors(ax, ay) {
  const up = rayDistance(ax, ay, [0, -1]);
  const down = rayDistance(ax, ay, [0, 1]);
  const left = rayDistance(ax, ay, [-1, 0]);
  const right = rayDistance(ax, ay, [1, 0]);

  const vx = goal.x - ax, vy = goal.y - ay;
  const norm = Math.sqrt(vx * vx + vy * vy) + 1e-6;
  const gx = vx / norm, gy = vy / norm;

  return [up, down, left, right, gx, gy];
}

// --- Agent ---
class Agent {
  constructor(net = null) {
    this.x = start.x;
    this.y = start.y;
    this.r = AGENT_R;
    this.dead = false;
    this.reached = false;
    this.step = 0;
    this.net = net || new Net();
    this.fitness = 0;
  }

  update() {
    if (this.dead || this.reached) return;
    if (this.step++ > STEP_LIMIT) { this.dead = true; return; }

    const s = sensors(this.x, this.y);
    const out = this.net.forward(s);

    const nx = this.x + out[0] * SPEED;
    const ny = this.y + out[1] * SPEED;

    if (collides(nx, ny, this.r)) {
      this.dead = true;
      return;
    }

    this.x = nx; this.y = ny;

    const dx = this.x - goal.x, dy = this.y - goal.y;
    if (dx * dx + dy * dy <= goal.r * goal.r) this.reached = true;
  }

  // LOGICZNO-MATEMATYCZNA POPRAWKA:
  // - fitness liczony względem START_TO_GOAL_DIST (sensowna normalizacja "postępu" w tym zadaniu),
  //   zamiast przekątnej canvasa (która nie odpowiada trudności konkretnego układu).
  // - nadal zachowujemy zakres do 10 i sztywną nagrodę za trafienie celu.
  computeFitness() {
    if (this.reached) {
      this.fitness = 10.0;
      return this.fitness;
    }

    const dist = Math.hypot(this.x - goal.x, this.y - goal.y);
    const progress = 1 - dist / (START_TO_GOAL_DIST + 1e-9); // 0..1 (w przybliżeniu)
    const distanceScore = Math.max(0, Math.min(1, progress)) * 5; // 0..5
    const aliveBonus = this.dead ? 0 : 0.3;

    this.fitness = Math.min(10.0, distanceScore + aliveBonus);
    return this.fitness;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = this.reached ? '#2ecc71' : (this.dead ? '#aa4444' : '#e0e0e0');
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Populacja i ewolucja ---
let population = [];
let generation = 0;
let bestFitness = 0;

function resetPopulation(hard = false) {
  if (hard) generation = 0;
  population = new Array(POP_SIZE).fill(0).map(() => new Agent(new Net(6, HIDDEN, 2)));
  bestFitness = 0;
  genEl.textContent = generation;
  bestEl.textContent = bestFitness.toFixed(3);
}
resetPopulation();

// turniej
function pickTournament_KOD1(pop, k = TOUR_SIZE, noRepeat = TOUR_NO_REPEAT) {
  const n = pop.length;
  if (!noRepeat) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const cand = pop[Math.floor(Math.random() * n)];
      if (!best || cand.fitness > best.fitness) best = cand;
    }
    return best;
  }
  if (k >= n) k = n;
  const used = new Set();
  let best = null;
  for (let i = 0; i < k; i++) {
    let idx;
    do { idx = Math.floor(Math.random() * n); }
    while (used.has(idx));
    used.add(idx);
    const cand = pop[idx];
    if (!best || cand.fitness > best.fitness) best = cand;
  }
  return best;
}

function crossoverWeights(w1, w2) {
  function mixMat(A, B) {
    return A.map((row, i) => row.map((v, j) => (Math.random() < 0.5 ? v : B[i][j])));
  }
  function mixVec(a, b) {
    return a.map((v, i) => (Math.random() < 0.5 ? v : b[i]));
  }
  return {
    W1: mixMat(w1.W1, w2.W1),
    b1: mixVec(w1.b1, w2.b1),
    W2: mixMat(w1.W2, w2.W2),
    b2: mixVec(w1.b2, w2.b2),
  };
}

function mutateWeights(w) {
  function mutMat(M) {
    for (let i = 0; i < M.length; i++) {
      for (let j = 0; j < M[i].length; j++) {
        if (Math.random() < MUT_RATE) M[i][j] += randn() * 0.2;
      }
    }
  }
  function mutVec(v) {
    for (let i = 0; i < v.length; i++) {
      if (Math.random() < MUT_RATE) v[i] += randn() * 0.2;
    }
  }
  mutMat(w.W1); mutVec(w.b1);
  mutMat(w.W2); mutVec(w.b2);
}

function evolve() {
  let best = null;
  for (const a of population) {
    const f = a.computeFitness();
    if (!best || f > best.fitness) best = a;
  }
  bestFitness = best.fitness;

  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  const next = [];

  // LOGICZNA POPRAWKA ODPORNOŚCI:
  // - gdy ELITE_COUNT > POP_SIZE albo 0, unikamy wyjścia poza zakres.
  const eliteN = Math.max(0, Math.min(ELITE_COUNT, POP_SIZE));
  for (let i = 0; i < eliteN; i++) {
    const w = sorted[i].net.copyWeights();
    next.push(new Agent(new Net(6, HIDDEN, 2, w)));
  }

  while (next.length < POP_SIZE) {
    const p1 = pickTournament_KOD1(population, TOUR_SIZE, TOUR_NO_REPEAT);
    const p2 = pickTournament_KOD1(population, TOUR_SIZE, TOUR_NO_REPEAT);
    const childW = crossoverWeights(p1.net.copyWeights(), p2.net.copyWeights());
    mutateWeights(childW);
    next.push(new Agent(new Net(6, HIDDEN, 2, childW)));
  }

  population = next;
  generation++;
  genEl.textContent = generation;
}

// --- Pętla ---
let t = 0;
function loop() {
  drawMaze();

  for (const a of population) {
    if (!paused) a.update();
    a.draw();
  }

  if (!paused) {
    t++;
    const allDone = population.every(a => a.dead || a.reached) || t >= STEP_LIMIT;
    if (allDone) {
      evolve();
      bestEl.textContent = bestFitness.toFixed(3);
      t = 0;

      // reset stanu agentów (bez wymiany sieci — sieci są już w "population")
      for (const a of population) {
        a.step = 0;
        a.dead = false;
        a.reached = false;
        a.x = start.x;
        a.y = start.y;
      }
    }
  }

  requestAnimationFrame(loop);
}
loop();