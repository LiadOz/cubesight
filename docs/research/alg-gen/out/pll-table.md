| case | algs found | best by ergo score (STM, score) | shortest incl. AUF | best RU-only | classic alg found? | inverse / mirror case |
|---|---|---|---|---|---|---|
| Aa | 70 | `R U' R F2 R' U R' U' R2 F2 R2 U` (12, 16) | 11 STM: `F U2 R' D' R U' R' D R U' F'` | none <= 20 STM | yes | Ab / Ab |
| Ab | 70 | `U' R2 F2 R2 U R U' R F2 R' U R'` (12, 16) | 11 STM: `F U R' D' R U R' D R U2 F'` | none <= 20 STM | yes | Aa / Aa |
| E | 8 | `F2 U' F2 U2 R2 U R2 U F2 R2 U2 R2 U F2 U2` (15, 23) | 15 STM: `F2 U' F2 U2 R2 U R2 U F2 R2 U2 R2 U F2 U2` | none <= 20 STM | out of depth (17 STM, RUD) | E (self) / E (self) |
| F | 20 | `U' F2 U2 R2 U R2 U' R2 U2 R2 U' F2 U2 R2 U' R2` (16, 20) | 15 STM: `R2 F R F' R' U' F' U F R2 U R' U' R U` | none <= 20 STM | out of depth (18 STM, RUF) | F (self) / F (self) |
| Ga | 22 | `D' R2 U R' U R' U' R U' R2 U' D R' U R` (15, 19) | 15 STM: `D' R2 U R' U R' U' R U' R2 U' D R' U R` | none <= 20 STM | yes | Gb / Gc |
| Gb | 22 | `D R' U' R D' U R2 U R' U R U' R U' R2` (15, 19) | 15 STM: `D R' U' R D' U R2 U R' U R U' R U' R2` | none <= 20 STM | yes | Ga / Gd |
| Gc | 22 | `U' R2 U2 R2 F2 U' R2 U R2 U F2 U2 R2 U' R2` (15, 19) | 15 STM: `U' R2 U2 R2 F2 U' R2 U R2 U F2 U2 R2 U' R2` | none <= 20 STM | yes | Gd / Ga |
| Gd | 22 | `R2 U R2 U2 F2 U' R2 U' R2 U F2 R2 U2 R2 U` (15, 19) | 15 STM: `R2 U R2 U2 F2 U' R2 U' R2 U F2 R2 U2 R2 U` | none <= 20 STM | yes | Gc / Gb |
| H | 104 | `M2 U' M2 U2 M2 U' M2` (7, 9) | 7 STM: `M2 U' M2 U2 M2 U' M2` | 11 STM: `R2 U2 R' U2 R2 U2 R2 U2 R' U2 R2` | yes | H (self) / H (self) |
| Ja | 66 | `U2 L' R' U2 R U R' U2 L U' R U2` (12, 17) | 10 STM: `L' R' U2 L U L' U2 R U' L` | none <= 20 STM | out of depth (13 STM, UFL) | Ja (self) / Jb |
| Jb | 64 | `L R U2 R' U' R U2 L' U R' U'` (11, 16) | 11 STM: `L R U2 R' U' R U2 L' U R' U'` | none <= 20 STM | yes | Jb (self) / Ja |
| Na | 27 | `R2 U2 F2 U' R2 U' R2 U F2 U R2 U R2 U' R2 U` (16, 20) | 14 STM: `F2 U2 R2 U F2 U2 F2 R2 U R2 U2 R2 F2 U` | none <= 20 STM | out of depth (16 STM, RUF) | Na (self) / Nb |
| Nb | 27 | `R U' R2 F2 U' R F2 R' U F2 R2 U R' U` (14, 20) | 14 STM: `R U' R2 F2 U' R F2 R' U F2 R2 U R' U` | none <= 20 STM | out of depth (17 STM, RUF) | Nb (self) / Na |
| Ra | 36 | `R2 F2 U R U R' U' R' U' F2 R' U R' U'` (14, 18) | 14 STM: `R2 F2 U R U R' U' R' U' F2 R' U R' U'` | none <= 20 STM | yes | Ra (self) / Rb |
| Rb | 36 | `R' U2 R U2 R' F R U R' U' R' F' R2` (13, 17) | 13 STM: `R' U2 R U2 R' F R U R' U' R' F' R2` | none <= 20 STM | yes | Rb (self) / Ra |
| T | 58 | `D R2 U' R2 U R2 D' U R2 U R2 U' R2` (13, 17) | 11 STM: `D R2 D' F2 U F2 R2 U R2 U' R2` | none <= 20 STM | yes | T (self) / T (self) |
| Ua | 84 | `M2 U M U2 M' U M2` (7, 9) | 7 STM: `M2 U M U2 M' U M2` | 11 STM: `R U' R U R U R U' R' U' R2` | yes | Ub / Ub |
| Ub | 87 | `M2 U' M' U2 M U' M2` (7, 9) | 7 STM: `M2 U' M' U2 M U' M2` | 11 STM: `R' U R' U' R' U' R' U R U R2` | yes | Ua / Ua |
| V | 16 | `U' R2 U2 R2 U R2 U2 F2 U R2 U R2 U2 F2 U' R2` (16, 20) | 16 STM: `U' R2 U2 R2 U R2 U2 F2 U R2 U R2 U2 F2 U' R2` | none <= 20 STM | out of depth (16 STM, RUD) | V (self) / V (self) |
| Y | 40 | `R2 U' R2 F2 U' R2 U R2 U F2 U' R2 U R2 U'` (15, 19) | 13 STM: `F2 U F2 U F2 U' R' U' R F2 R' U R` | none <= 20 STM | out of depth (16 STM, RUF) | Y (self) / Y (self) |
| Z | 110 | `M2 U M' U2 M2 U2 M' U' M2` (9, 11.5) | 9 STM: `M2 U M' U2 M2 U2 M' U' M2` | 15 STM: `R2 U' R2 U' R' U2 R2 U2 R2 U2 R' U R2 U R2` | yes | Z (self) / Z (self) |
