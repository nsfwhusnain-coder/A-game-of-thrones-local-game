| run | interpret, fair 125 (dev 100 + holdout 25) | clarify | mind in character | mind fallbacks | narrate first try | voices first try (audience / council / director / consolidate) |
|---|---|---|---|---|---|---|
| Gemma 4 12B, untuned (3 runs) | **107.7 mean/125 = 86.2 %** (runs: 107, 108, 108) | 6.5 % | 106/123 = 86.2 % | 16 | 178/212 = 84 % | 18/20 / 8/15 / 17/20 / 6/6 |
| untuned + MTP | **105/125 = 84 %** (runs: 105) | 6.5 % | 107/123 = 87 % | 19 | – | – |
| untuned, game with the R8 men-count fix | **110/125 = 88 %** (runs: 110) | 6.5 % | – | – | – | – |
| phase 1 (interpret only): p1A | **110/125 = 88 %** (runs: 110) | 2.2 % | – | – | – | – |
| phase 1: p1B | **107/125 = 85.6 %** (runs: 107) | 1.8 % | – | – | – | – |
| phase 1: p1M (average) | **108/125 = 86.4 %** (runs: 108) | 2.2 % | – | – | – | – |
| phase 1: p1A merged into the 4-bit model | **108/125 = 86.4 %** (runs: 108) | 4.3 % | – | – | – | – |
| phase 2: p2A | **114/125 = 91.2 %** (runs: 114) | 2.8 % | 106/123 = 86.2 % | 4 | 164/212 = 77.4 % | 17/20 / 10/15 / 18/20 / 6/6 |
| phase 2: p2B | **105/125 = 84 %** (runs: 105) | 2.2 % | 110/123 = 89.4 % | 3 | 178/212 = 84 % | 17/20 / 12/15 / 17/20 / 6/6 |
| **phase 2: p2M (average of A+B) = Maester-12B v1** | **110 mean/125 = 88 %** (runs: 110, 110) | 2.5 % | 110/123 = 89.4 % | 2 | 171/212 = 80.7 % | 18/20 / 13/15 / 19/20 / 6/6 |
| p2M + MTP (the default served profile) | **109/125 = 87.2 %** (runs: 109) | 2.5 % | 108/123 = 87.8 % | 3 | – | – |
| phase 3: p3A | **112/125 = 89.6 %** (runs: 112) | 2.8 % | – | – | – | – |
| phase 3: p3B | **112/125 = 89.6 %** (runs: 112) | 2.5 % | – | – | – | – |
| phase 3: p3M (average) | **111.5 mean/125 = 89.2 %** (runs: 111, 112) | 3.1 % | 105/123 = 85.4 % | 0 | 180/212 = 84.9 % | 19/20 / 9/15 / 19/20 / 5/6 |
| p3M, game with the R8 men-count fix | **113/125 = 90.4 %** (runs: 113) | 2.8 % | – | – | – | – |
| phase 4: p4M (average) | **111/125 = 88.8 %** (runs: 111) | 3.4 % | 107/123 = 87 % | 6 | – | – |
