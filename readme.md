# Algorytm Genetyczny: Nawigacja w Labiryncie

Populacja agentów z zakodowanym DNA (sekwencja ruchów) ewoluuje w labiryncie 2D, szukając ścieżki od startu do celu. Brak sieci neuronowej — czyste operatory genetyczne na wektorze ruchów.

## Architektura

### Środowisko
Labirynt 280×280 px. Ściany zewnętrzne (grubość 5 px) + wewnętrzne przeszkody. Start: lewy dolny róg. Cel: prawy górny róg, promień akceptacji 12 px.

### Agent i DNA
Każdy agent posiada DNA jako `Float32Array` o długości `2 × DNA_LEN`. Każdy gen to para `[kąt, prędkość]`. Agent wykonuje ruchy sekwencyjnie — gen po genie, krok po kroku:

- `dx = cos(kąt) × prędkość`
- `dy = sin(kąt) × prędkość`

Kolizja ze ścianą = śmierć. Dotarcie do strefy celu = sukces. Wyczerpanie DNA = śmierć.

Zakres inicjalizacji: kąt 0–2π, prędkość 1.0–3.0 px/krok.

## Algorytm Genetyczny

### Parametry

| Parametr | Zakres / Wartość | Restart? |
|:---|:---|:---|
| Długość DNA | 100–600 (domyślnie 400) | Tak |
| Mutacja | 1%–30% (domyślnie 5%) | Nie |
| Elita | 1–10 (domyślnie 5) | Nie |
| Metoda selekcji | Ruletka / Turniej / Ranking | Nie |
| Rozmiar turnieju | 2–100 (domyślnie 5) | Nie |
| Turniej bez powtórzeń | checkbox | Nie |
| Imigranci | 15% populacji | Stałe |

Populacja: 100 agentów.

### Fitness

Surowy fitness w zakresie [0, 1], trzy składniki:

| Składnik | Waga | Obliczenie |
|:---|:---|:---|
| Postęp | 80% | `1 − (dystans_do_celu / dystans_start→cel)` |
| Przetrwanie | 10% | `wykonane_kroki / DNA_LEN` |
| Bonus za dotarcie | 10% | `0.6 + (1 − kroki/DNA_LEN) × 0.4` (tylko przy sukcesie) |

Po obliczeniu surowego fitness:
1. **Normalizacja** do [0, 1] względem min/max populacji, z potęgą 1.2 (nacisk na lepszych).
2. **Fitness sharing** — obniżenie fitness agentów w promieniu 7 px od siebie. Promuje niszowanie i zapobiega grupowaniu się w jednym punkcie.

### Selekcja

Trzy metody do wyboru w UI:

**Ruletka** — prawdopodobieństwo proporcjonalne do fitness (po sharingu).

**Turniej** — losuje k kandydatów, zwycięzca = najwyższy fitness. Opcja bez powtórzeń (częściowy Fisher-Yates).

**Ranking** — sortowanie rosnące po fitness, wybór wg liniowego rozkładu rang (waga = pozycja).

### Krzyżowanie
Jednopunktowe na granicy genu. Punkt cięcia losowy spośród `DNA_LEN` genów. Dziecko dziedziczy geny 0..cut od rodzica A, resztę od rodzica B.

### Mutacja
Per-genowa z prawdopodobieństwem `MUT_RATE`:
- Kąt: perturbacja ±0.6 rad, normalizacja do [0, 2π].
- Prędkość: mnożnik 0.75–1.25, clamp do [0.5, 5.0].

### Elitaryzm i Imigranci
Elita: top N osobników kopiowanych wprost (bez mutacji). Imigranci: 15% populacji nadpisywane losowymi agentami — przeciwdziałanie stagnacji.

## Wizualizacja

- **Ślady agentów** — opcjonalny offscreen canvas z inkrementalnym rysowaniem (quadratic smoothing). Przełącznik w UI.
- **Trasa najlepszego** — najlepsza historyczna trajektoria rysowana na wierzchu.
- **Średnia trasa** — uśredniona pozycja populacji w każdym kroku.
- **Histogram fitness** — rozkład surowego fitness w 20 binach.
- **Statystyki** — najlepszy i średni fitness (w %), numer generacji, żywe agenty.

## Szczegóły implementacyjne

- DNA i trajektorie jako `Float32Array` (optymalizacja pamięci).
- Kolizja: test przecięcia okręgu z prostokątem (nearest point on AABB).
- Offscreen canvas buforuje ślady — unika przerysowywania wszystkich tras co klatkę.
- Pętla: `requestAnimationFrame`, jeden krok DNA na klatkę.
- Cykl: symulacja (t: 0 → DNA_LEN) → evolve() → reset kroków → nowa generacja.

### Złożoność na generację

| Operacja | Koszt |
|:---|:---|
| Symulacja ruchu | O(POP_SIZE × DNA_LEN) |
| Fitness sharing | O(POP_SIZE²) |
| Selekcja + krzyżowanie | O(POP_SIZE × k) |
| **Łącznie** | **O(POP_SIZE² + POP_SIZE × DNA_LEN)** |

## Stack

HTML5 Canvas (main + offscreen buffer), vanilla JS, requestAnimationFrame.
```