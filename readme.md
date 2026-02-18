# Algorytm Genetyczny: Nawigacja w Labiryncie

## Opis Projektu
Symulacja algorytmu genetycznego rozwiązującego problem nawigacji w labiryncie. Populacja agentów (kropek) ewoluuje, aby znaleźć optymalną ścieżkę od punktu startowego do celu, unikając ścian. Implementacja w JavaScript z wizualizacją na canvas.

## Ogólna Struktura Algorytmu

### Problem
- Nawigacja w labiryncie 280x280 px od punktu startowego (lewy dolny róg) do celu (prawy górny róg).
- Labirynt zawiera proste ściany wewnętrzne, symulujące przeszkody.

### Reprezentacja Rozwiązania
- Każde rozwiązanie (agent) ma "DNA" – sekwencję 300 genów (domyślnie `DNA_LEN = 300`).
- Każdy gen to para `[kąt, prędkość]`, gdzie kąt to kierunek ruchu (0–2π rad), prędkość to odległość w pikselach na krok.
- DNA przechowywane jako `Float32Array` o długości `2 * DNA_LEN` dla optymalizacji pamięci i wydajności.

### Populacja i Cykl Ewolucyjny
- **Populacja**: 100 agentów (`POP_SIZE = 100`).
- **Cykl**:
  1. **Symulacja ruchu**: W każdej epoce (od `t=0` do `t=DNA_LEN-1`) wszyscy agenci wykonują jeden krok: `dx = cos(kąt) * prędkość`, `dy = sin(kąt) * prędkość`.
  2. **Ocena fitness**: Po wykonaniu wszystkich kroków obliczany jest fitness.
  3. **Ewolucja**: Selekcja rodziców, krzyżowanie, mutacja, tworzenie nowej populacji (z elitaryzmem i imigrantami).
  4. **Powtórzenie**: Cykl trwa w nieskończoność z wizualizacją na canvas.
- Algorytm jest deterministyczny w ramach symulacji, ale losowość wprowadza różnorodność.

## Mechanizmy Kluczowe

### Generowanie DNA
- Losowy kąt (0–2π) i prędkość (1.0–3.0 px/krok).
- Wzór ruchu: `dx = cos(kąt) * prędkość`, `dy = sin(kąt) * prędkość`.

### Ruch Agenta
- Krok po kroku z kontrolą kolizji (aproksymacja okrąg-prostokąt).
- Agent zatrzymuje się po uderzeniu w ścianę lub wykonaniu wszystkich kroków.
- Ślad (trail) rysowany dla wizualizacji.

### Fitness
Składa się z trzech komponentów (ważonych):
- **Postęp** (80% wagi): `(1 - odległość_do_celu / odległość_start-cel)`, zakres [0,1]. Nagroda za zbliżenie.
- **Przetrwanie** (10% wagi): `(liczba_wykonanych_kroków / DNA_LEN)`, zakres [0,1]. Nagroda za dłuższe życie.
- **Bonus za dotarcie** (10% wagi): Jeśli dotrze, bonus `0.6 + (1 - kroki/DNA_LEN) * 0.4`.
- **Normalizacja**: Surowy fitness normalizowany do [0,1] z potęgą 1.2 dla nacisku na lepsze.
- **Fitness sharing**: Obniża fitness w "tłoku" (promień 7 px), promując nisze ewolucyjne.

### Selekcja
Trzy metody (wybieralne w UI):
- **Ruletka**: Prawdopodobieństwo proporcjonalne do fitnessu.
- **Turniej**: Losowanie k=5–50 agentów (domyślnie 15), wybór najlepszego. Opcja "bez powtórzeń".
- **Ranking**: Wybór wg liniowego rozkładu rang.

### Krzyżowanie
- Jednopunktowe na poziomie genów (para [kąt, prędkość]).
- Punkt cięcia losowy.

### Mutacja
- Prawdopodobieństwo `MUT_RATE = 0.05` (5%) na gen.
- Zmiana: kąt ±0.6 rad (z normalizacją), prędkość * (0.75–1.25), ograniczona do [0.5, 5.0].

### Elitaryzm i Imigranci
- **Elitaryzm**: `ELITE_COUNT = 5` najlepszych przechodzi bez zmian.
- **Imigranci**: 15% populacji – losowe nowe agenty.

### Wizualizacja
- Canvas 280x280 px, histogram fitnessu, statystyki (najlepszy, średni, całkowity fitness).

## Matematyczna Analiza

### Przestrzeń Rozwiązań
- Każde DNA to punkt w R^{600} (300 par [kąt, prędkość]).
- Ruch deterministyczny, ewolucja eksploruje przestrzeń mutacjami i krzyżowaniem.

### Konwergencja
- Dążenie do lokalnych optimum; fitness sharing zapobiega przedwczesnej konwergencji.

### Złożoność
- Symulacja ruchu: O(POP_SIZE * DNA_LEN) na epokę.
- Ewolucja: O(POP_SIZE²) dla fitness sharing.
- Całkowita: O(POP_SIZE² + POP_SIZE * DNA_LEN) na generację – akceptowalna dla małych populacji.

### Losowość i Skala
- Używa `Math.random()` (pseudolosowość, brak seedu).
- Skala: Labirynt 280x280 px, agent r=3 px, prędkość 1.0–3.0 px/krok. Maksymalna odległość ~900 px w 300 krokach, umożliwia eksplorację.

