// =========================
// --- USTAWIENIA GLOBALNE
// =========================
const W = 280, H = 280; // nowy rozmiar canvasa
const WALL_THICK = 5; // grubość ścian w px
const POP_SIZE = 100;
let DNA_LEN = 300;
let MUT_RATE = 0.05;
let ELITE_COUNT = 5;

// stałe rozmiary markerów niezależne od poprzedniego rozmiaru
const START_R = 6;
const AGENT_R = 3;
// start i goal ustawione bezpośrednio w narożnikach nowego canvasa
const start = { x: WALL_THICK + START_R, y: H - WALL_THICK - START_R };
const goal = { x: W - WALL_THICK - START_R, y: WALL_THICK + START_R, r: 12 };
const START_TO_GOAL_DIST = Math.hypot(start.x - goal.x, start.y - goal.y);

// Canvas
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

// Offscreen canvas for incremental trails drawing (redukuje koszt rysowania wielu tras co klatkę)
const trailsBuf = document.createElement('canvas');
trailsBuf.width = W; trailsBuf.height = H;
const tctx = trailsBuf.getContext('2d');
tctx.lineCap = 'round';
tctx.lineJoin = 'round';
tctx.globalCompositeOperation = 'source-over';

// UI
const genEl = document.getElementById('gen');
const popEl = document.getElementById('pop');
const bestEl = document.getElementById('best');
const avgEl = document.getElementById('avg');
const histCanvas = document.getElementById('hist');
const hctx = histCanvas ? histCanvas.getContext('2d') : null;
const dnaLenEl = document.getElementById('dnaLen');
const dnaLenValEl = document.getElementById('dnaLenVal');
const mutRateEl = document.getElementById('mutRate');
const mutRateValEl = document.getElementById('mutRateVal');
const eliteEl = document.getElementById('elite');
const eliteValEl = document.getElementById('eliteVal');
const btnRestart = document.getElementById('restart');
const btnPause = document.getElementById('pause');
const selMethodEl = document.getElementById('selMethod');
const showTrailsEl = document.getElementById('showTrails');

// NOWE: element pokazujący sumę fitness po sharingu (totalFit)
const totalFitEl = document.getElementById('totalFit');

// --- NOWE: kontrolki turniejowe ---
const tournamentSizeEl = document.getElementById('tournamentSize');
const tournamentSizeValEl = document.getElementById('tournamentSizeVal');
const tournamentNoReplaceEl = document.getElementById('tournamentNoReplace');
// domyślna wartość (zgodna z dotychczasowym zachowaniem)
let TOURNAMENT_K = tournamentSizeEl ? Number(tournamentSizeEl.value) : 5;
let TOURNAMENT_NO_REPLACE = tournamentNoReplaceEl ? tournamentNoReplaceEl.checked : false;

if (tournamentSizeEl) {
  tournamentSizeEl.oninput = () => {
    TOURNAMENT_K = Math.max(2, Math.min(population.length || 100, Number(tournamentSizeEl.value)));
    tournamentSizeValEl.textContent = TOURNAMENT_K;
  };
}
if (tournamentNoReplaceEl) {
  tournamentNoReplaceEl.onchange = () => { TOURNAMENT_NO_REPLACE = tournamentNoReplaceEl.checked; };
}

// Obsługa UI
dnaLenEl.oninput = () => { DNA_LEN = +dnaLenEl.value; dnaLenValEl.textContent = DNA_LEN; resetPopulation(); };
mutRateEl.oninput = () => { MUT_RATE = +mutRateEl.value / 100; mutRateValEl.textContent = Math.round(MUT_RATE * 100); };
eliteEl.oninput = () => { ELITE_COUNT = +eliteEl.value; eliteValEl.textContent = ELITE_COUNT; };
btnRestart.onclick = () => resetPopulation(true);
let paused = false;
btnPause.onclick = () => { paused = !paused; btnPause.textContent = paused ? 'Wznów' : 'Pauza'; };

popEl.textContent = POP_SIZE;

// =========================
// --- LABIRYNT (ściany)
// =========================
// proste ściany labiryntu dopasowane do nowego rozmiaru
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
  // tło
  ctx.fillStyle = '#0b192b';
  ctx.fillRect(0, 0, W, H);

  // cel
  ctx.beginPath();
  ctx.fillStyle = '#22cd00ff';
  ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
  ctx.fill();

  // start
  ctx.beginPath();
  ctx.fillStyle = '#3498db';
  ctx.arc(start.x, start.y, START_R, 0, Math.PI * 2);
  ctx.fill();

  // ściany
  ctx.fillStyle = '#0074cd';
  for (const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);
}

// proste sprawdzenie kolizji okrąg-prostokąt (aproksymacja)
function collides(x, y, r = AGENT_R) {
  for (const w of walls) {
    const nearestX = Math.max(w.x, Math.min(x, w.x + w.w));
    const nearestY = Math.max(w.y, Math.min(y, w.y + w.h));
    const dx = x - nearestX;
    const dy = y - nearestY;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  // ramy canvasa traktujemy jak ściany
  if (x < WALL_THICK + r || x > W - WALL_THICK - r || y < WALL_THICK + r || y > H - WALL_THICK - r) return true;
  return false;
}

// =========================
// --- AGENT (z DNA i śladem)
// =========================
// Agent wykorzystuje typowane tablice dla DNA i zapisu trajektorii
class Agent {
  constructor(dna = null) {
    this.x = start.x; this.y = start.y;
    this.dead = false; this.reached = false;
    this.step = 0; this.r = AGENT_R;

    // DNA jako Float32Array [dx,dy, dx,dy, ...]
    this.dna = dna ? new Float32Array(dna) : Agent.randomDNA();

    // Trail: prealokowana tablica (DNA_LEN+1) par XY
    this.trail = new Float32Array((DNA_LEN + 1) * 2);
    this.trailLen = 1;
    this.trail[0] = this.x; this.trail[1] = this.y;

    this.fitness = 0;
  }

  static randomDNA() {
    const out = new Float32Array(DNA_LEN * 2);
    for (let i = 0; i < DNA_LEN; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.6;
      out[i * 2] = Math.cos(angle) * speed;
      out[i * 2 + 1] = Math.sin(angle) * speed;
    }
    return out;
  }

  update() {
    if (this.dead || this.reached) return;
    if (this.step >= DNA_LEN) { this.dead = true; return; }

    const idx = this.step * 2;
    const dx = this.dna[idx];
    const dy = this.dna[idx + 1];
    this.step++;
    const nx = this.x + dx;
    const ny = this.y + dy;

    if (collides(nx, ny, this.r)) {
      this.dead = true;
      if (this.trailLen * 2 + 1 < this.trail.length) {
        this.trail[this.trailLen * 2] = nx; this.trail[this.trailLen * 2 + 1] = ny; this.trailLen++;
      }
      return;
    }

    // Rysujemy segment do bufora z lekkim wygładzeniem (quadratic)
    if (showTrailsEl.checked) {
      const px = this.x, py = this.y;
      tctx.save();
      tctx.globalAlpha = 0.06;
      tctx.strokeStyle = '#ddd';
      tctx.lineWidth = 1;
      tctx.beginPath();
      tctx.moveTo(px, py);
      // proste wygładzenie: quadratic do środka
      const mx = (px + nx) * 0.5, my = (py + ny) * 0.5;
      tctx.quadraticCurveTo(px, py, mx, my);
      tctx.lineTo(nx, ny);
      tctx.stroke();
      tctx.restore();
    }

    this.x = nx; this.y = ny;
    if (this.trailLen * 2 + 1 < this.trail.length) {
      this.trail[this.trailLen * 2] = this.x; this.trail[this.trailLen * 2 + 1] = this.y; this.trailLen++;
    }

    const ddx = this.x - goal.x, ddy = this.y - goal.y;
    if (ddx * ddx + ddy * ddy <= goal.r * goal.r) this.reached = true;
  }

  // poprawiona funkcja licząca surowy fitness w [0..1]
  computeFitness(startPos = start, goalPos = goal, maxSteps = DNA_LEN) {
    // używaj aktualnej pozycji agenta (this.x, this.y)
    const px = this.x, py = this.y;
    const dist = Math.hypot(px - goalPos.x, py - goalPos.y);
    const startDist = Math.max(1e-6, START_TO_GOAL_DIST);
    const progress = Math.max(0, 1 - dist / startDist);
    // const progress = Math.max(0, 1 - dist / startDist); // 0..1
    const survival = (this.step || 0) / Math.max(1, maxSteps); // 0..1
    const reachedBonus = this.reached ? 0.6 + (1 - (this.step / maxSteps)) * 0.4 : 0; // 0..1 extra when reached
    // let raw = progress * 0.7 + survival * 0.2 + reachedBonus * 0.1;
    let raw = progress * 0.8 + survival * 0.1 + reachedBonus * 0.1;
    raw = Math.max(0, Math.min(1, raw));
    this._rawFitness = raw;
    return raw;
  }

  draw() {
    ctx.beginPath();
    ctx.fillStyle = this.reached ? '#2ecc71' : (this.dead ? '#c54646ff' : '#e0e0e0');
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStoredTrail(alpha = 1, color = '#ffd166', width = 2.5) {
    if (this.trailLen < 2) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    ctx.moveTo(this.trail[0], this.trail[1]);
    for (let i = 1; i < this.trailLen; i++) ctx.lineTo(this.trail[i * 2], this.trail[i * 2 + 1]);
    ctx.stroke(); ctx.restore();
  }
}

// =========================
// --- POPULACJA I EWOLUCJA
// =========================
let population = [];
let generation = 0;
let bestFitness = 0;
let bestAgentEver = null; // przechowuje najlepszego z całego przebiegu (opcjonalnie)
let avgAgentEver = null; // przechowuje uśrednioną trasę z poprzedniej generacji
// krok symulacji (indeks DNA) — deklarujemy wcześniej, aby reset mógł go zresetować
let t = 0;

function resetPopulation(hard = false) {
  if (hard) generation = 0;
  population = new Array(POP_SIZE).fill(0).map(() => new Agent());
  bestFitness = 0;
  bestAgentEver = null;
  avgAgentEver = null;
  // reset czasu symulacji (krok DNA)
  t = 0;
  // clear trails buffer
  tctx.clearRect(0, 0, W, H);
  // clear main canvas to remove any leftover drawings
  ctx.clearRect(0, 0, W, H);
  genEl.textContent = generation;
  bestEl.textContent = bestFitness.toFixed(3);
  if (avgEl) avgEl.textContent = (0).toFixed(3);
}

resetPopulation();

// --- Krzyżowanie (jednopunktowe) dla typowanych tablic [dx,dy, dx,dy, ...] ---
function crossover(dna1, dna2) {
  const len = dna1.length; // 2 * DNA_LEN
  // wybieramy punkt cięcia na granicy genu (pary dx/dy)
  const geneCount = len >> 1;
  const cutGene = Math.floor(Math.random() * (geneCount + 1));
  const cut = cutGene * 2;
  const child = new Float32Array(len);
  for (let i = 0; i < len; i++) child[i] = i < cut ? dna1[i] : dna2[i];
  return child;
}

// --- Mutacja dla Float32Array DNA ---
function mutate(dna) {
  // dna długość = DNA_LEN * 2
  for (let g = 0; g < DNA_LEN; g++) {
    if (Math.random() < MUT_RATE) {
      const idx = g * 2;
      const angle = Math.atan2(dna[idx + 1], dna[idx]) + (Math.random() * 1.2 - 0.6);
      const speed = 1.6 * (1 + (Math.random() * 0.2 - 0.1));
      dna[idx] = Math.cos(angle) * speed;
      dna[idx + 1] = Math.sin(angle) * speed;
    }
  }
}

// --- METODY SELEKCJI ---
// Wybór rodzica zależnie od ustawienia w UI: 'roulette', 'tournament', 'rank'
function pickParent(method, population, totalFit) {
  if (method === 'roulette') return pickRoulette(population, totalFit);
  // używamy dynamicznej wartości TOURNAMENT_K pobranej z UI
  // uwaga: pickTournament zawsze zwraca jeden zwycięzcę (number of winners = 1)
  if (method === 'tournament') return pickTournament(population, TOURNAMENT_K, TOURNAMENT_NO_REPLACE);
  if (method === 'rank') return pickRank(population);
  return pickRoulette(population, totalFit);
}

// 1) Ruletka: prawdopodobieństwo proporcjonalne do fitnessu
function pickRoulette(population, totalFit) {
  // jeśli totalFit jest bliskie 0 (np. wszyscy mają 0), wybieramy losowo
  if (totalFit <= 0) return population[Math.floor(Math.random() * population.length)];
  const r = Math.random() * totalFit;
  let acc = 0;
  for (const a of population) {
    acc += a.fitness;
    if (acc >= r) return a;
  }
  return population[population.length - 1];
}

// 2) Turniej: losujemy k osobników i wybieramy najlepszego
// pool: losujemy k kandydatów (pula = TOURNAMENT_K), zwycięzców = 1
function pickTournament(population, k = 3, noReplace = false) {
  const n = population.length;
  if (n === 0) return null;
  // ogranicz k do wielkości populacji
  k = Math.max(1, Math.min(k, n));
  let best = null;
  if (noReplace && k > 1) {
    // losowanie bez powtórzeń: wybierz k unikalnych indeksów (częściowy Fisher-Yates)
    const idxs = [];
    for (let i = 0; i < n; i++) idxs.push(i);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      const tmp = idxs[i]; idxs[i] = idxs[j]; idxs[j] = tmp;
      const cand = population[idxs[i]];
      if (!best || cand.fitness > best.fitness) best = cand;
    }
  } else {
    // losowanie z powtórzeniami (domyślnie) — zachowanie dotychczasowe
    for (let i = 0; i < k; i++) {
      const cand = population[Math.floor(Math.random() * n)];
      if (!best || cand.fitness > best.fitness) best = cand;
    }
  }
  return best;
}

// 3) Ranka: sortujemy po fitness i wybieramy według rozkładu rangi
function pickRank(population) {
  // tworzymy tablicę posortowaną rosnąco (najgorszy -> najlepszy)
  const sorted = [...population].sort((a, b) => a.fitness - b.fitness);
  // przypisujemy rangi 1..N, ale chcemy większe prawdopodobieństwo dla wyższych rang
  // użyjemy prostego rozkładu liniowego: waga = index+1
  const n = sorted.length;
  const totalRank = (n * (n + 1)) / 2;
  let r = Math.random() * totalRank;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += (i + 1);
    if (acc >= r) return sorted[i];
  }
  return sorted[n - 1];
}

function evolve() {
  // 1) Oblicz surowe fitnessy
  for (const a of population) a.computeFitness();
  let minRaw = Infinity, maxRaw = -Infinity;
  for (const a of population) {
    const r = (typeof a._rawFitness === 'number') ? a._rawFitness : a.fitness;
    if (r < minRaw) minRaw = r;
    if (r > maxRaw) maxRaw = r;
  }

  // >>> TU wstaw zabezpieczenie <<<
  // zadeklaruj totalFit wcześniej, aby uniknąć globalnego przecieku i mieć go dostępnego
  let totalFit = 0;

  if (maxRaw === minRaw) {
    // wszyscy mają ten sam wynik – ustaw fitness na 1 (później policzymy totalFit po sharingu)
    for (const a of population) {
      a.fitness = 1.0;
    }
    // nie robimy early return — dalej wykona się sharing, histogram i selekcja
  } else {
    // 2) Normalizacja fitness do [0..1]
    const eps = 1e-8;
    for (const a of population) {
      const raw = (typeof a._rawFitness === 'number') ? a._rawFitness : a.fitness;
      let norm = (raw - minRaw) / Math.max(eps, (maxRaw - minRaw));
      norm = Math.pow(norm, 1.2);
      a.fitness = Math.max(0.01, Math.min(1, norm)); // minimalny próg 0.01
    }
  }

  // >>> DODANE ze starej wersji: średni surowy fitness w procentach <<<
  const avgRaw = population.reduce(
    (s, a) => s + ((typeof a._rawFitness === 'number') ? a._rawFitness : a.fitness),
    0
  ) / population.length;
  const bestRaw = maxRaw;
  bestEl.textContent = (bestRaw * 100).toFixed(1);
  if (avgEl) avgEl.textContent = (avgRaw * 100).toFixed(1);
  // <<< KONIEC DODANEGO FRAGMENTU >>>
  // 3) Fitness sharing — obniż fitness w tłoku
  const sigmaShare = 7; // promień niszy (dopasuj do skali labiryntu)
  for (const a of population) {
    let denom = 0;
    for (const b of population) {
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist < sigmaShare) {
        denom += 1 - (dist / sigmaShare);
      }
    }
    if (denom > 0) a.fitness = a.fitness / denom;
  }

  // --- WAŻNE: przelicz totalFit po sharingu, bo pickRoulette korzysta z sumy końcowych fitnessów
  totalFit = population.reduce((s, a) => s + a.fitness, 0);

  // aktualizuj widok totalFit (nie wpływa na logikę)
  if (totalFitEl) totalFitEl.textContent = totalFit.toFixed(3);

  // 3b) Rysowanie histogramu fitnessów

if (hctx) {
  const bins = 20;
  const counts = new Array(bins).fill(0);

  for (const a of population) {
    const v = Math.max(0, Math.min(1, a.fitness));
    let idx = Math.floor(v * bins);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }

  const cw = histCanvas.width, ch = histCanvas.height;
  hctx.clearRect(0, 0, cw, ch);

  // tło
  hctx.fillStyle = '#0b192b';
  hctx.fillRect(0, 0, cw, ch);

  const maxC = Math.max(1, counts.reduce((m, c) => Math.max(m, c), 0));
  const barW = cw / bins;

  // gradient dla całego histogramu (od góry do dołu)
  const gradient = hctx.createLinearGradient(0, 20, 0, ch - 20);
  gradient.addColorStop(0, '#22cd00ff'); // zielony u góry
  gradient.addColorStop(1, '#0060df');   // niebieski u dołu

  // słupki
  for (let i = 0; i < bins; i++) {
    const h = (counts[i] / maxC) * (ch - 40);
    const x = i * barW;
    const y = (ch - 20) - h;

    hctx.fillStyle = gradient;
    hctx.fillRect(x + 1, y, Math.max(1, barW - 2), h);
  }

  // podpisy
  hctx.fillStyle = '#fff';
  hctx.font = '12px sans-serif';
  hctx.textAlign = 'center';
  hctx.fillText('Fitness', cw / 2, 14);
  hctx.fillText('0', barW * 0.4, ch - 8);
  hctx.fillText('50', cw / 2, ch - 8);
  hctx.fillText('100', cw - barW * 1.0, ch - 8);
}

  // 4) Statystyki i najlepszy agent
  const best = population.reduce((acc, a) => (!acc || a.fitness > acc.fitness) ? a : acc, null);
  bestFitness = best.fitness;
  generation++;
  genEl.textContent = generation;
  bestEl.textContent = (best._rawFitness * 100).toFixed(1);

  // 5) Sortowanie populacji
  const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
  // --- aktualizacja najlepszego agenta w historii ---
  if (!bestAgentEver || (typeof best._rawFitness === 'number' && typeof bestAgentEver._rawFitness === 'number' ? best._rawFitness > bestAgentEver._rawFitness : best.fitness > bestAgentEver.fitness)) {
    bestAgentEver = new Agent(new Float32Array(best.dna));
    bestAgentEver.trail = best.trail.slice();
    bestAgentEver.trailLen = best.trailLen || 0;
    bestAgentEver.x = best.x;
    bestAgentEver.y = best.y;
    bestAgentEver.fitness = best.fitness;
    bestAgentEver._rawFitness = best._rawFitness;
  }

  // --- oblicz średnią trasę populacji ---
  try {
    const maxLen = Math.max(...population.map(a => a.trailLen || 0));
    if (maxLen > 1) {
      const avgTrail = new Float32Array(maxLen * 2);
      for (let i = 0; i < maxLen; i++) {
        let sx = 0, sy = 0, cnt = 0;
        for (const a of population) {
          if (a.trailLen > i) {
            sx += a.trail[i * 2];
            sy += a.trail[i * 2 + 1];
            cnt++;
          }
        }
        if (cnt > 0) {
          avgTrail[i * 2] = sx / cnt;
          avgTrail[i * 2 + 1] = sy / cnt;
        } else {
          const j = Math.max(0, i - 1);
          avgTrail[i * 2] = avgTrail[j * 2];
          avgTrail[i * 2 + 1] = avgTrail[j * 2 + 1];
        }
      }
      const proxy = new Agent(new Float32Array(DNA_LEN * 2));
      proxy.trail = avgTrail;
      proxy.trailLen = maxLen;
      avgAgentEver = proxy;
    }
  } catch (e) {
    console.warn('avg trail error', e);
  }

  // 6) Tworzymy nowe pokolenie
  const next = [];

  // Elita (1–2 osobniki)
  for (let i = 0; i < ELITE_COUNT; i++) {
    const dnaCopy = new Float32Array(sorted[i].dna);
    next.push(new Agent(dnaCopy));
  }

  // Wybrana metoda selekcji
  const method = selMethodEl.value;

  // Potomkowie
  while (next.length < POP_SIZE) {
    const p1 = pickParent(method, population, totalFit);
    const p2 = pickParent(method, population, totalFit);
    const childDNA = crossover(p1.dna, p2.dna);
    mutate(childDNA);
    next.push(new Agent(childDNA));
  }

  // 7) Imigranci — wstrzykujemy 5% losowych agentów
  const immigrants = Math.floor(POP_SIZE * 0.15);
  for (let i = 0; i < immigrants; i++) {
    next[next.length - 1 - i] = new Agent(); // nadpisz końcówkę populacji świeżymi
  }

  population = next;
}

// =========================
// --- PĘTLA SYMULACJI I RYSOWANIA
// =========================
function loop() {
  if (!paused) {
    // symulujemy kolejne kroki DNA (t od 0 do DNA_LEN-1)
    if (t < DNA_LEN) {
      drawMaze();
      // namaluj skumulowane trails z bufora
      if (showTrailsEl.checked) ctx.drawImage(trailsBuf, 0, 0);

      // aktualizujemy i rysujemy agentów
      for (const a of population) {
        a.update();
        a.draw();
      }

      // dodatkowo rysujemy najlepszą trajektorię z poprzedniej generacji grubszą linią
      if (bestAgentEver && bestAgentEver.trailLen > 1) {
        bestAgentEver.drawStoredTrail(0.9, '#128a00ff', 2.5);
      }
      // oraz uśrednioną trasę populacji (jeśli dostępna)
      if (avgAgentEver && avgAgentEver.trailLen > 1) {
        avgAgentEver.drawStoredTrail(0.6, '#ffdb6eff', 2.0);
      }

      t++;
    } else {
      // koniec epoki -> ewolucja
      evolve();

      // resetujemy krok i czyścimy ślady bufora (nowe potomstwo rysuje swoje trails od zera)
      t = 0;
      tctx.clearRect(0, 0, W, H);

      // rysujemy stan po ewolucji (można zobaczyć nowe potomstwo)
      drawMaze();
      if (showTrailsEl.checked) ctx.drawImage(trailsBuf, 0, 0);
      for (const a of population) a.draw();
      if (avgAgentEver && avgAgentEver.trailLen > 1) avgAgentEver.drawStoredTrail(0.9, '#6ec1ff', 2.0);
    }
  }

  requestAnimationFrame(loop);
}

loop();