// Golden solves for the solve-analysis tests. Each entry is a scramble and a
// solution whose replay on the real state model ends solved (the tests check
// that first). They are built so every stage boundary is known by design:
//
//   A   = F' D' F D B D' R D'          optimal-ish D cross, completes on its last move
//   FR  = R U R' U'   FL = L' U' L U   BR = R' U R U'   BL = L U L' U'
//         each is a commutator that disturbs exactly one F2L slot and keeps the cross;
//         the pair is in place after its third move, the last U' is a free AUF
//   EO  = F R U R' U' F'   SUNE = R U R' U R U2 R'   T = T-perm   UA = U-perm (corners home)
//
// The scramble is the inverse of the solution, so the state after each solution
// prefix equals the inverse of the remaining moves. That fixes where the cross,
// each pair, EO, CO and the end fall. "D <commutator> D'" slots a pair while the
// D layer is offset (a pseudo pair). The cn* entries are the same solve as
// `normal`, relabelled so the cross sits on U, F or L.
export const GOLD = {
  normal: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  xcross: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  pseudoPair: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R D U' L' U L D' U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' D L' U' L U D' R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  mixed: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' D' U R' U' R D U' L' U L D U R U' R' D' L' D2 L D' B' D B",
    moves: "B' D' B D L' D2 L D R U R' U' D' L' U' L U D' R' U R U' D L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  pseudoLastUD: {
    scramble: "D U' U L U' L' D' U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U D L U L' U' U D'",
  },
  pseudoLastDU: {
    scramble: "U' D U L U' L' D' U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U D L U L' U' D' U",
  },
  ehSkip: {
    scramble: "U' R U2 R' U' R U' R' U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' R U R' U R U2 R' U",
  },
  ollSkip: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  ollPllSkip: {
    scramble: "U2 U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' U2",
  },
  cpSkip: {
    scramble: "R2 U R U R' U' R' U' R' U R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U' R U R U R U' R' U' R2",
  },
  cancel: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L U U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' U' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  stray: {
    scramble: "F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U L U' L' U R' U' R U' L' U L D U' D' U R U' R' D R' D B' D' F' D F",
    moves: "F' D' F D B D' R D' R U R' U' D U D' L' U' L U R' U R U' L U L' U' F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'",
  },
  pseudoXcross: {
    scramble: "D F R U' R' U R U R2 F' R U R U' R' R U2 R' U' R U' R' F U R U' R' F' U' L' U L U R U' R' R' D B' D' F' D F",
    moves: "F' D' F D B D' R R U R' U' L' U' L U F R U R' U' F' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' D'",
  },
  cnU: {
    scramble: "B R D' R' D R D R2 B' R D R D' R' R D2 R' D' R D' R' B D R D' R' B' D L D' L' D R' D' R D' L' D L D R D' R' U R' U F' U' B' U B",
    moves: "B' U' B U F U' R U' R D R' D' L' D' L D R' D R D' L D L' D' B R D R' D' B' R D R' D R D2 R' R D R' D' R' B R2 D' R' D' R D R' B'",
  },
  cnF: {
    scramble: "U R B' R' B R B R2 U' R B R B' R' R B2 R' B' R B' R' U B R B' R' U' B L B' L' B R' B' R B' L' B L B R B' R' F R' F D' F' U' F U",
    moves: "U' F' U F D F' R F' R B R' B' L' B' L B R' B R B' L B L' B' U R B R' B' U' R B R' B R B2 R' R B R' B' R' U R2 B' R' B' R B R' U'",
  },
  cnL: {
    scramble: "F D R' D' R D R D2 F' D R D R' D' D R2 D' R' D R' D' F R D R' D' F' R U R' U' R D' R' D R' U' R U R D R' D' L D' L B' L' F' L F",
    moves: "F' L' F L B L' D L' D R D' R' U' R' U R D' R D R' U R U' R' F D R D' R' F' D R D' R D R2 D' D R D' R' D' F D2 R' D' R' D R D' F'",
  },
};

// Real scramble and cross from the review spec (docs/design/brain-v2/review/SPEC.md
// section 4.1): optimal cross is 6 moves, the user took 8 with a detour on move 4.
// The BL pair then goes in pseudo with D L' U' L D' (SPEC 8.1 trace 0, 3, null, null, 3, 0).
export const MOCK = {
  scramble: "D2 F2 U' B2 R2 U2 F2 U' L2 D' B' L' U F' R' D2 R U' F2 L'",
  cross: "F' D' F D B D' R D'",
  blPseudo: "D L' U' L D'",
};
