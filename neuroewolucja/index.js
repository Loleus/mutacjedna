// ═══════════════════════════════════════════════════════════════
// STAŁE GEOMETRYCZNE
// ═══════════════════════════════════════════════════════════════
const W = 280, H = 280;
const WALL_THICK = 5;
const START_R = 6;      // promień markera startu i celu
const AGENT_R = 3;      // promień agenta
const GOAL_R = 12;      // promień strefy celu (do osiągnięcia)

// Pozycje w narożnikach
const start = { x: WALL_THICK + START_R + 2, y: H - WALL_THICK - START_R - 2 };
const goal = { x: W - WALL_THICK - START_R - 2, y: WALL_THICK + START_R + 2, r: GOAL_R };

// Dystans referencyjny do normalizacji fitness
const START_TO_GOAL_DIST = Math.hypot(goal.x - start.x, goal.y - start.y);
const DIAGONAL = Math.hypot(W, H);

// ═══════════════════════════════════════════════════════════════
// PARAMETRY NEUROEWOLUCJI
// ═══════════════════════════════════════════════════════════════
const POP_SIZE = 100;
let HIDDEN = 8;
let MUT_RATE = 0.1;
let ELITE_COUNT = 3;
let TOUR_SIZE = 5;
let TOUR_NO_REPEAT = true;

const STEP_LIMIT = 600;   // mniej kroków dla mniejszego canvasa
const SPEED = 1.0;        // wolniej = precyzyjniej

// ═══════════════════════════════════════════════════════════════
// ELEMENTY DOM
// ═══════════════════════════════════════════════════════════════
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

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

popEl.textContent = POP_SIZE;

// ═══════════════════════════════════════════════════════════════
// HANDLERY UI
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// LABIRYNT - proporcjonalny układ
// ═══════════════════════════════════════════════════════════════
const walls = [
    // ══ Ściany zewnętrzne ══
    { x: 0, y: 0, w: W, h: WALL_THICK },                    // góra
    { x: 0, y: H - WALL_THICK, w: W, h: WALL_THICK },       // dół
    { x: 0, y: 0, w: WALL_THICK, h: H },                    // lewo
    { x: W - WALL_THICK, y: 0, w: WALL_THICK, h: H },       // prawo

    // wewnętrzne, prosty układ w środku canvasu
    {
        x: Math.round(W * 0.2),
        y: Math.round(H * 0.2),
        w: Math.round(W * 0.6),
        h: WALL_THICK
    },
    { x: Math.round(W * 0.2), y: Math.round(H * 0.2), w: WALL_THICK, h: Math.round(H * 0.6) },
    { x: Math.round(W * 0.4), y: Math.round(H * 0.55), w: Math.round(W * 0.4), h: WALL_THICK },
    { x: Math.round(W * 0.7), y: Math.round(H * 0.2), w: WALL_THICK, h: Math.round(H * 0.4) },
];

// ═══════════════════════════════════════════════════════════════
// RYSOWANIE
// ═══════════════════════════════════════════════════════════════
function drawMaze() {
    // Tło
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, W, H);

    // Cel (zielony okrąg)
    ctx.beginPath();
    ctx.fillStyle = '#2ecc71';
    ctx.arc(goal.x, goal.y, goal.r, 0, Math.PI * 2);
    ctx.fill();

    // Start (niebieski okrąg)
    ctx.beginPath();
    ctx.fillStyle = '#3498db';
    ctx.arc(start.x, start.y, START_R, 0, Math.PI * 2);
    ctx.fill();

    // Ściany
    ctx.fillStyle = '#777';
    for (const w of walls) {
        ctx.fillRect(w.x, w.y, w.w, w.h);
    }
}

// ═══════════════════════════════════════════════════════════════
// DETEKCJA KOLIZJI
// Sprawdza czy okrąg (x,y,r) koliduje z którąkolwiek ścianą
// Algorytm: znajdź najbliższy punkt prostokąta do środka okręgu
// ═══════════════════════════════════════════════════════════════
function collides(x, y, r = AGENT_R) {
    for (const w of walls) {
        // Najbliższy punkt na prostokącie do punktu (x, y)
        const nearestX = Math.max(w.x, Math.min(x, w.x + w.w));
        const nearestY = Math.max(w.y, Math.min(y, w.y + w.h));

        // Dystans od środka okręgu do najbliższego punktu
        const dx = x - nearestX;
        const dy = y - nearestY;

        if (dx * dx + dy * dy <= r * r) return true;
    }

    // Dodatkowe sprawdzenie granic (margines bezpieczeństwa)
    if (x < WALL_THICK + r || x > W - WALL_THICK - r ||
        y < WALL_THICK + r || y > H - WALL_THICK - r) {
        return true;
    }

    return false;
}

// ═══════════════════════════════════════════════════════════════
// SIEĆ NEURONOWA
// Architektura: 6 → HIDDEN → 2
// Wejścia: [ray_up, ray_down, ray_left, ray_right, goal_dx, goal_dy]
// Wyjścia: [move_dx, move_dy] ∈ [-1, 1] (tanh)
// ═══════════════════════════════════════════════════════════════

// Generator liczb z rozkładu normalnego (Box-Muller)
function randn() {
    const u = Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u + 1e-10)) * Math.cos(2 * Math.PI * v);
}

class Net {
    constructor(inDim = 6, hiddenDim = HIDDEN, outDim = 2, weights = null) {
        this.inDim = inDim;
        this.hiddenDim = hiddenDim;
        this.outDim = outDim;

        if (weights) {
            // Kopiuj istniejące wagi
            this.W1 = weights.W1;
            this.b1 = weights.b1;
            this.W2 = weights.W2;
            this.b2 = weights.b2;
        } else {
            // Inicjalizacja Xavier/Glorot - lepsza zbieżność
            const scale1 = Math.sqrt(2.0 / (inDim + hiddenDim));
            const scale2 = Math.sqrt(2.0 / (hiddenDim + outDim));

            this.W1 = Array.from({ length: hiddenDim }, () =>
                Array.from({ length: inDim }, () => randn() * scale1)
            );
            this.b1 = Array.from({ length: hiddenDim }, () => 0);

            this.W2 = Array.from({ length: outDim }, () =>
                Array.from({ length: hiddenDim }, () => randn() * scale2)
            );
            this.b2 = Array.from({ length: outDim }, () => 0);
        }
    }

    forward(x) {
        // Warstwa ukryta: ReLU(W1 · x + b1)
        const h = new Array(this.hiddenDim);
        for (let i = 0; i < this.hiddenDim; i++) {
            let sum = this.b1[i];
            for (let j = 0; j < this.inDim; j++) {
                sum += this.W1[i][j] * x[j];
            }
            h[i] = sum > 0 ? sum : 0;  // ReLU
        }

        // Warstwa wyjściowa: tanh(W2 · h + b2)
        const y = new Array(this.outDim);
        for (let i = 0; i < this.outDim; i++) {
            let sum = this.b2[i];
            for (let j = 0; j < this.hiddenDim; j++) {
                sum += this.W2[i][j] * h[j];
            }
            y[i] = Math.tanh(sum);  // tanh → [-1, 1]
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

// ═══════════════════════════════════════════════════════════════
// SENSORY - raycasting
// Zwraca znormalizowaną odległość do ściany w danym kierunku
// ═══════════════════════════════════════════════════════════════
function rayDistance(x, y, dirX, dirY) {
    const step = 1.5;  // mały krok dla precyzji w małym canvasie
    const maxDist = DIAGONAL;
    let dist = 0;
    let cx = x, cy = y;

    while (dist < maxDist) {
        cx += dirX * step;
        cy += dirY * step;
        dist += step;

        if (collides(cx, cy, 0.5)) break;
    }

    // Normalizacja do [0, 1]: 0 = blisko ściany, 1 = daleko
    return Math.min(1.0, dist / maxDist);
}

function sensors(ax, ay) {
    // Ray-casting w 4 kierunkach
    const up = rayDistance(ax, ay, 0, -1);
    const down = rayDistance(ax, ay, 0, +1);
    const left = rayDistance(ax, ay, -1, 0);
    const right = rayDistance(ax, ay, +1, 0);

    // Wektor do celu (znormalizowany do jednostkowego)
    const vx = goal.x - ax;
    const vy = goal.y - ay;
    const norm = Math.hypot(vx, vy) + 1e-8;
    const gx = vx / norm;  // ∈ [-1, 1]
    const gy = vy / norm;  // ∈ [-1, 1]

    return [up, down, left, right, gx, gy];
}

// ═══════════════════════════════════════════════════════════════
// AGENT
// ═══════════════════════════════════════════════════════════════
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
        this.minDist = START_TO_GOAL_DIST;  // śledzenie najlepszego postępu
    }

    update() {
        if (this.dead || this.reached) return;

        if (this.step++ > STEP_LIMIT) {
            this.dead = true;
            return;
        }

        // Odczytaj sensory i wykonaj forward pass
        const s = sensors(this.x, this.y);
        const out = this.net.forward(s);

        // Oblicz nową pozycję
        const nx = this.x + out[0] * SPEED;
        const ny = this.y + out[1] * SPEED;

        // Sprawdź kolizję
        if (collides(nx, ny, this.r)) {
            this.dead = true;
            return;
        }

        // Zaktualizuj pozycję
        this.x = nx;
        this.y = ny;

        // Śledź minimalny dystans do celu
        const distToGoal = Math.hypot(this.x - goal.x, this.y - goal.y);
        if (distToGoal < this.minDist) {
            this.minDist = distToGoal;
        }

        // Sprawdź osiągnięcie celu
        if (distToGoal <= goal.r) {
            this.reached = true;
        }
    }

    computeFitness() {
        // Jeśli osiągnął cel: baza + umiarkowany bonus za szybkość
        if (this.reached) {
            // Bazowy wysoki fitness (zostawiamy 10) + speedBonus maksymalnie 2 → max = 12
            const speedBonus = Math.max(0, 1 - (this.step / STEP_LIMIT)) * 2.0;
            this.fitness = 10.0 + speedBonus;
            // Opcjonalne drobne rozróżnienie między bardzo szybkimi a umiarkowanymi
            // this.fitness += (STEP_LIMIT - this.step) / STEP_LIMIT * 0.1;
            return this.fitness;
        }

        // Dla nieosiągniętych: ocena postępu względem start→cel
        const progress = 1 - (this.minDist / START_TO_GOAL_DIST);
        const progressScore = Math.max(0, progress) * 7.0; // skala 0..7

        // Mały bonus za przeżycie i eksplorację, ale tak, by nie przekroczyć 10
        const aliveBonus = this.dead ? 0 : 0.25;
        const exploreBonus = (this.step / STEP_LIMIT) * 0.15;

        this.fitness = progressScore + aliveBonus + exploreBonus;

        // Upewnij się, że nieosiągnięci pozostają poniżej progu 10
        this.fitness = Math.min(this.fitness, 9.99);

        return this.fitness;
    }


    draw() {
        ctx.beginPath();
        if (this.reached) {
            ctx.fillStyle = '#2ecc71';  // zielony - cel osiągnięty
        } else if (this.dead) {
            ctx.fillStyle = '#aa4444';  // czerwony - martwy
        } else {
            ctx.fillStyle = '#e0e0e0';  // biały - żywy
        }
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ═══════════════════════════════════════════════════════════════
// POPULACJA I OPERATORY GENETYCZNE
// ═══════════════════════════════════════════════════════════════
let population = [];
let generation = 0;
let bestFitness = 0;

function resetPopulation(hard = false) {
    if (hard) generation = 0;
    population = Array.from({ length: POP_SIZE },
        () => new Agent(new Net(6, HIDDEN, 2))
    );
    bestFitness = 0;
    genEl.textContent = generation;
    bestEl.textContent = bestFitness.toFixed(3);
}

// ═══ SELEKCJA TURNIEJOWA ═══
// Losuje k osobników i zwraca najlepszego
function pickTournament(pop, k = TOUR_SIZE, noRepeat = TOUR_NO_REPEAT) {
    const n = pop.length;

    if (!noRepeat) {
        // Z powtórzeniami - prostsze i szybsze
        let best = null;
        for (let i = 0; i < k; i++) {
            const idx = Math.floor(Math.random() * n);
            const cand = pop[idx];
            if (!best || cand.fitness > best.fitness) {
                best = cand;
            }
        }
        return best;
    }

    // Bez powtórzeń - więcej różnorodności
    const effectiveK = Math.min(k, n);
    const used = new Set();
    let best = null;

    while (used.size < effectiveK) {
        const idx = Math.floor(Math.random() * n);
        if (used.has(idx)) continue;
        used.add(idx);

        const cand = pop[idx];
        if (!best || cand.fitness > best.fitness) {
            best = cand;
        }
    }

    return best;
}

// ═══ KRZYŻOWANIE WLAG (uniform crossover) ═══
function crossoverWeights(w1, w2) {
    function mixMatrix(A, B) {
        return A.map((row, i) =>
            row.map((val, j) => (Math.random() < 0.5 ? val : B[i][j]))
        );
    }

    function mixVector(a, b) {
        return a.map((val, i) => (Math.random() < 0.5 ? val : b[i]));
    }

    return {
        W1: mixMatrix(w1.W1, w2.W1),
        b1: mixVector(w1.b1, w2.b1),
        W2: mixMatrix(w1.W2, w2.W2),
        b2: mixVector(w1.b2, w2.b2),
    };
}

// ═══ MUTACJA WAG ═══
// Każda waga ma szansę MUT_RATE na dodanie szumu gaussowskiego
function mutateWeights(w) {
    const mutationStrength = 0.2;

    function mutMatrix(M) {
        for (let i = 0; i < M.length; i++) {
            for (let j = 0; j < M[i].length; j++) {
                if (Math.random() < MUT_RATE) {
                    M[i][j] += randn() * mutationStrength;
                }
            }
        }
    }

    function mutVector(v) {
        for (let i = 0; i < v.length; i++) {
            if (Math.random() < MUT_RATE) {
                v[i] += randn() * mutationStrength;
            }
        }
    }

    mutMatrix(w.W1);
    mutVector(w.b1);
    mutMatrix(w.W2);
    mutVector(w.b2);
}

// ═══ EWOLUCJA - TWORZENIE NOWEJ GENERACJI ═══
function evolve() {
    // Oblicz fitness dla wszystkich
    let best = null;
    for (const agent of population) {
        agent.computeFitness();
        if (!best || agent.fitness > best.fitness) {
            best = agent;
        }
    }
    bestFitness = best.fitness;

    // Sortuj malejąco po fitness
    const sorted = [...population].sort((a, b) => b.fitness - a.fitness);
    const nextGen = [];

    // ELITARYZM: kopiuj najlepszych bez zmian
    const eliteCount = Math.min(ELITE_COUNT, sorted.length);
    for (let i = 0; i < eliteCount; i++) {
        const weights = sorted[i].net.copyWeights();
        nextGen.push(new Agent(new Net(6, HIDDEN, 2, weights)));
    }

    // REPRODUKCJA: selekcja + krzyżowanie + mutacja
    while (nextGen.length < POP_SIZE) {
        const parent1 = pickTournament(population);
        const parent2 = pickTournament(population);

        const childWeights = crossoverWeights(
            parent1.net.copyWeights(),
            parent2.net.copyWeights()
        );

        mutateWeights(childWeights);

        nextGen.push(new Agent(new Net(6, HIDDEN, 2, childWeights)));
    }

    population = nextGen;
    generation++;
    genEl.textContent = generation;
}

// ═══════════════════════════════════════════════════════════════
// PĘTLA GŁÓWNA
// ═══════════════════════════════════════════════════════════════
let frameCount = 0;

function loop() {
    // Rysuj labirynt
    drawMaze();

    // Aktualizuj i rysuj agentów
    for (const agent of population) {
        if (!paused) agent.update();
        agent.draw();
    }

    if (!paused) {
        frameCount++;

        // Sprawdź koniec generacji
        const allDone = population.every(a => a.dead || a.reached);
        const timeUp = frameCount >= STEP_LIMIT;

        if (allDone || timeUp) {
            // Ewolucja
            evolve();
            bestEl.textContent = bestFitness.toFixed(3);

            // Reset dla nowej generacji
            frameCount = 0;
            for (const agent of population) {
                agent.x = start.x;
                agent.y = start.y;
                agent.step = 0;
                agent.dead = false;
                agent.reached = false;
                agent.minDist = START_TO_GOAL_DIST;
            }
        }
    }

    requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
resetPopulation();
loop();
