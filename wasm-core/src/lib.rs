//! Small, deterministic core for a corner-recognition training UI.
//!
//! The public API deliberately exchanges JSON strings.  That keeps the
//! browser-facing surface stable and means the same core can be tested on a
//! native target without depending on `js_sys` or browser globals.

use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const CASE_COUNT: u8 = 24;

#[derive(Clone, Copy)]
struct Corner {
    name: &'static str,
    faces: [&'static str; 3],
}

const CORNERS: [Corner; 8] = [
    Corner {
        name: "URF",
        faces: ["U", "R", "F"],
    },
    Corner {
        name: "UBR",
        faces: ["U", "B", "R"],
    },
    Corner {
        name: "ULB",
        faces: ["U", "L", "B"],
    },
    Corner {
        name: "UFL",
        faces: ["U", "F", "L"],
    },
    Corner {
        name: "DFR",
        faces: ["D", "F", "R"],
    },
    Corner {
        name: "DLF",
        faces: ["D", "L", "F"],
    },
    Corner {
        name: "DBL",
        faces: ["D", "B", "L"],
    },
    Corner {
        name: "DRB",
        faces: ["D", "R", "B"],
    },
];

const EDGE_NAMES: [&str; 12] = [
    "UF", "UR", "UB", "UL", "FR", "BR", "BL", "FL", "DF", "DR", "DB", "DL",
];

/// A generated target. `stickers` is ordered around the corner and rotates
/// when the orientation changes, which is useful to a renderer that hides the
/// corner cubies while retaining the centers and edges.
#[derive(Debug, Clone, Serialize)]
pub struct CornerCase {
    pub id: String,
    pub index: u8,
    pub position: String,
    pub orientation: u8,
    pub stickers: [Sticker; 3],
    pub centers: [Sticker; 6],
    pub edges: [Edge; 12],
    pub hidden_corners: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sticker {
    pub face: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub position: String,
    pub stickers: [Sticker; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CaseStat {
    pub attempts: u32,
    pub correct: u32,
    pub total_time_ms: f64,
    pub best_time_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct History {
    #[serde(default)]
    pub cases: std::collections::BTreeMap<String, CaseStat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeakCase {
    pub id: String,
    pub attempts: u32,
    pub accuracy: f64,
    pub mean_time_ms: Option<f64>,
    pub weakness: f64,
}

fn sticker(face: &str) -> Sticker {
    Sticker {
        face: face.to_owned(),
        color: face.to_owned(),
    }
}

fn case_at(index: u8) -> CornerCase {
    let normalized = index % CASE_COUNT;
    let corner = CORNERS[(normalized / 3) as usize];
    let orientation = normalized % 3;
    let mut stickers = [
        sticker(corner.faces[0]),
        sticker(corner.faces[1]),
        sticker(corner.faces[2]),
    ];
    stickers.rotate_left(orientation as usize);

    let centers = ["U", "R", "F", "D", "L", "B"].map(sticker);
    let edges = EDGE_NAMES.map(|name| {
        let chars: Vec<&str> = name.split("").filter(|part| !part.is_empty()).collect();
        Edge {
            position: name.to_owned(),
            stickers: [sticker(chars[0]), sticker(chars[1])],
        }
    });

    CornerCase {
        id: format!("{}-o{}", corner.name, orientation),
        index: normalized,
        position: corner.name.to_owned(),
        orientation,
        stickers,
        centers,
        edges,
        hidden_corners: true,
    }
}

fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("training data is serializable")
}

fn parse_history(input: &str) -> History {
    serde_json::from_str(input).unwrap_or_default()
}

/// A tiny xorshift generator. It is intentionally deterministic so a session
/// can be replayed from its seed, while still providing a useful random case
/// when JavaScript passes a time-based seed.
fn next_seed(seed: u64) -> u64 {
    let mut value = if seed == 0 { 0x9e3779b97f4a7c15 } else { seed };
    value ^= value << 7;
    value ^= value >> 9;
    value ^= value << 8;
    value
}

/// Number of canonical corner-position/orientation cases.
#[wasm_bindgen]
pub fn case_count() -> u8 {
    CASE_COUNT
}

/// Return the complete catalog, useful for populating a case filter.
#[wasm_bindgen]
pub fn case_catalog() -> String {
    json(&(0..CASE_COUNT).map(case_at).collect::<Vec<_>>())
}

/// Generate a canonical case by index. Indices wrap, so UI state can safely
/// increment/decrement without a separate bounds check.
#[wasm_bindgen]
pub fn generate_case(index: u8) -> String {
    json(&case_at(index))
}

/// Generate a reproducible case from a seed. The returned `seed` is not
/// exposed in the case itself; callers can retain their seed if replay is
/// needed and pass it again for the same result.
#[wasm_bindgen]
pub fn random_case(seed: u64) -> String {
    let value = next_seed(seed);
    json(&case_at((value % CASE_COUNT as u64) as u8))
}

/// Record one timed recognition attempt and return the updated history.
/// Invalid/negative times are treated as zero; malformed history starts fresh.
#[wasm_bindgen]
pub fn score_attempt(case_id: &str, elapsed_ms: f64, correct: bool, history_json: &str) -> String {
    let mut history = parse_history(history_json);
    let elapsed_ms = if elapsed_ms.is_finite() && elapsed_ms >= 0.0 {
        elapsed_ms
    } else {
        0.0
    };
    let stat = history.cases.entry(case_id.to_owned()).or_default();
    stat.attempts = stat.attempts.saturating_add(1);
    if correct {
        stat.correct = stat.correct.saturating_add(1);
    }
    stat.total_time_ms += elapsed_ms;
    stat.best_time_ms = Some(
        stat.best_time_ms
            .map_or(elapsed_ms, |best| best.min(elapsed_ms)),
    );
    json(&history)
}

/// Rank cases by weakness. Untested cases are included first, followed by
/// cases with low accuracy and slower mean recognition times. This makes the
/// result directly usable for weighted practice queues.
#[wasm_bindgen]
pub fn weak_cases(history_json: &str, limit: u8) -> String {
    let history = parse_history(history_json);
    let mut ranked: Vec<WeakCase> = (0..CASE_COUNT)
        .map(|index| {
            let id = case_at(index).id;
            let stat = history.cases.get(&id).cloned().unwrap_or_default();
            let accuracy = if stat.attempts == 0 {
                0.0
            } else {
                stat.correct as f64 / stat.attempts as f64
            };
            let mean_time_ms =
                (stat.attempts > 0).then_some(stat.total_time_ms / stat.attempts as f64);
            // Untested cases receive a full weakness score. For tested cases,
            // errors matter twice as much as latency, normalized around 2s.
            let latency = mean_time_ms.map_or(0.0, |time| (time / 2000.0).min(1.0));
            let weakness = if stat.attempts == 0 {
                1.0
            } else {
                (1.0 - accuracy) * 0.67 + latency * 0.33
            };
            WeakCase {
                id,
                attempts: stat.attempts,
                accuracy,
                mean_time_ms,
                weakness,
            }
        })
        .collect();
    ranked.sort_by(|a, b| {
        b.weakness
            .partial_cmp(&a.weakness)
            .unwrap_or(Ordering::Equal)
            .then_with(|| a.id.cmp(&b.id))
    });
    ranked.truncate(limit.min(CASE_COUNT) as usize);
    json(&ranked)
}

// ---- F2L case generation -------------------------------------------------

const FACE_ORDER: [&str; 6] = ["U", "R", "F", "D", "L", "B"];

#[derive(Clone, Copy)]
struct EdgeSpec {
    name: &'static str,
    faces: [&'static str; 2],
}

const EDGE_SPECS: [EdgeSpec; 12] = [
    EdgeSpec {
        name: "UF",
        faces: ["U", "F"],
    },
    EdgeSpec {
        name: "UR",
        faces: ["U", "R"],
    },
    EdgeSpec {
        name: "UB",
        faces: ["U", "B"],
    },
    EdgeSpec {
        name: "UL",
        faces: ["U", "L"],
    },
    EdgeSpec {
        name: "FR",
        faces: ["F", "R"],
    },
    EdgeSpec {
        name: "BR",
        faces: ["B", "R"],
    },
    EdgeSpec {
        name: "BL",
        faces: ["B", "L"],
    },
    EdgeSpec {
        name: "FL",
        faces: ["F", "L"],
    },
    EdgeSpec {
        name: "DF",
        faces: ["D", "F"],
    },
    EdgeSpec {
        name: "DR",
        faces: ["D", "R"],
    },
    EdgeSpec {
        name: "DB",
        faces: ["D", "B"],
    },
    EdgeSpec {
        name: "DL",
        faces: ["D", "L"],
    },
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct F2lCorner {
    pub id: String,
    pub home_position: String,
    pub position: String,
    pub orientation: u8,
    pub stickers: [Sticker; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct F2lEdge {
    pub id: String,
    pub home_position: String,
    pub position: String,
    pub orientation: u8,
    pub stickers: [Sticker; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Facelet {
    pub face: String,
    pub index: u8,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct F2lPair {
    pub id: u8,
    pub corner: String,
    pub edge: String,
    pub corner_position: String,
    pub edge_position: String,
    pub corner_orientation: u8,
    pub edge_orientation: u8,
    pub solved: bool,
}

/// A complete legal cubie state. The `facelets` array has 54 entries in
/// `U, R, F, D, L, B` face order, nine entries per face, and can be rendered
/// without implementing cube move logic in JavaScript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct F2lCase {
    pub id: String,
    pub seed: u64,
    pub bottom_face: String,
    pub opposite_face: String,
    pub cross_solved: bool,
    pub cross_edges: Vec<String>,
    pub f2l_corner_positions: Vec<String>,
    pub f2l_edge_positions: Vec<String>,
    pub centers: [Sticker; 6],
    pub corners: Vec<F2lCorner>,
    pub edges: Vec<F2lEdge>,
    pub pairs: Vec<F2lPair>,
    pub facelets: Vec<Facelet>,
    pub corner_permutation_parity: u8,
    pub edge_permutation_parity: u8,
    pub corner_twist_sum: u8,
    pub edge_flip_sum: u8,
}

struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u64) -> Self {
        Self {
            state: next_seed(seed ^ 0xa076_1d64_78bd_642f),
        }
    }

    fn next(&mut self) -> u64 {
        self.state = next_seed(self.state);
        self.state
    }

    fn index(&mut self, bound: usize) -> usize {
        (self.next() as usize) % bound
    }

    fn shuffle<T>(&mut self, values: &mut [T]) {
        for i in (1..values.len()).rev() {
            values.swap(i, self.index(i + 1));
        }
    }
}

fn face_index(face: &str) -> Option<usize> {
    match face.trim().to_ascii_uppercase().as_str() {
        "U" => Some(0),
        "R" => Some(1),
        "F" => Some(2),
        "D" => Some(3),
        "L" => Some(4),
        "B" => Some(5),
        _ => None,
    }
}

fn opposite(face: &str) -> &'static str {
    match face {
        "U" => "D",
        "D" => "U",
        "R" => "L",
        "L" => "R",
        "F" => "B",
        _ => "F",
    }
}

fn contains_face(faces: &[&str], face: &str) -> bool {
    faces.iter().any(|candidate| *candidate == face)
}

fn permutation_parity(permutation: &[usize]) -> u8 {
    let mut inversions = 0u8;
    for i in 0..permutation.len() {
        for j in (i + 1)..permutation.len() {
            inversions ^= (permutation[i] > permutation[j]) as u8;
        }
    }
    inversions
}

// Each tuple is (face, index) in a conventional 3x3 net. The exact net
// orientation is kept stable for the UI; center index 4 is filled separately.
fn corner_facelets(name: &str) -> [(&'static str, u8); 3] {
    match name {
        "URF" => [("U", 8), ("R", 0), ("F", 2)],
        "UBR" => [("U", 2), ("B", 0), ("R", 2)],
        "ULB" => [("U", 0), ("L", 0), ("B", 2)],
        "UFL" => [("U", 6), ("F", 0), ("L", 2)],
        "DFR" => [("D", 2), ("F", 8), ("R", 6)],
        "DLF" => [("D", 0), ("L", 8), ("F", 6)],
        "DBL" => [("D", 6), ("B", 8), ("L", 6)],
        "DRB" => [("D", 8), ("R", 8), ("B", 6)],
        _ => panic!("unknown corner position"),
    }
}

fn edge_facelets(name: &str) -> [(&'static str, u8); 2] {
    match name {
        "UF" => [("U", 7), ("F", 1)],
        "UR" => [("U", 5), ("R", 1)],
        "UB" => [("U", 1), ("B", 1)],
        "UL" => [("U", 3), ("L", 1)],
        "FR" => [("F", 5), ("R", 3)],
        "BR" => [("B", 3), ("R", 5)],
        "BL" => [("B", 5), ("L", 3)],
        "FL" => [("F", 3), ("L", 5)],
        "DF" => [("D", 1), ("F", 7)],
        "DR" => [("D", 5), ("R", 7)],
        "DB" => [("D", 7), ("B", 7)],
        "DL" => [("D", 3), ("L", 7)],
        _ => panic!("unknown edge position"),
    }
}

fn facelet_offset(face: &str) -> usize {
    FACE_ORDER
        .iter()
        .position(|candidate| *candidate == face)
        .unwrap()
        * 9
}

fn build_facelets(
    corner_perm: &[usize; 8],
    corner_ori: &[u8; 8],
    edge_perm: &[usize; 12],
    edge_ori: &[u8; 12],
) -> Vec<Facelet> {
    let mut facelets: Vec<Facelet> = FACE_ORDER
        .iter()
        .flat_map(|face| {
            (0..9).map(move |index| Facelet {
                face: (*face).to_owned(),
                index,
                color: (*face).to_owned(),
            })
        })
        .collect();

    for position in 0..8 {
        let home = &CORNERS[corner_perm[position]];
        for (slot, (face, index)) in corner_facelets(CORNERS[position].name).iter().enumerate() {
            let color = home.faces[(slot + corner_ori[position] as usize) % 3];
            facelets[facelet_offset(face) + *index as usize].color = color.to_owned();
        }
    }
    for position in 0..12 {
        let home = &EDGE_SPECS[edge_perm[position]];
        for (slot, (face, index)) in edge_facelets(EDGE_SPECS[position].name).iter().enumerate() {
            let source = if edge_ori[position] == 0 {
                slot
            } else {
                1 - slot
            };
            facelets[facelet_offset(face) + *index as usize].color = home.faces[source].to_owned();
        }
    }
    facelets
}

fn build_f2l_case_once(seed: u64, requested_bottom: &str) -> F2lCase {
    let requested = face_index(requested_bottom);
    let face = requested.map_or_else(|| (next_seed(seed ^ 0x4e) % 6) as usize, |value| value);
    let bottom = FACE_ORDER[face];
    let opposite_face = opposite(bottom);
    let mut rng = Rng::new(seed ^ ((face as u64 + 1) * 0x9e37_79b9));

    let cross_positions: Vec<usize> = EDGE_SPECS
        .iter()
        .enumerate()
        .filter_map(|(index, edge)| contains_face(&edge.faces, bottom).then_some(index))
        .collect();
    let f2l_corner_positions: Vec<usize> = CORNERS
        .iter()
        .enumerate()
        .filter_map(|(index, corner)| contains_face(&corner.faces, bottom).then_some(index))
        .collect();
    let f2l_edge_positions: Vec<usize> = EDGE_SPECS
        .iter()
        .enumerate()
        .filter_map(|(index, edge)| {
            (!contains_face(&edge.faces, bottom) && !contains_face(&edge.faces, opposite_face))
                .then_some(index)
        })
        .collect();

    let mut corner_perm = [0usize; 8];
    for (index, value) in corner_perm.iter_mut().enumerate() {
        *value = index;
    }
    rng.shuffle(&mut corner_perm);
    let mut edge_perm = [0usize; 12];
    for (index, value) in edge_perm.iter_mut().enumerate() {
        *value = index;
    }
    let non_cross: Vec<usize> = (0..12)
        .filter(|index| !cross_positions.contains(index))
        .collect();
    let mut edge_pool = non_cross.clone();
    rng.shuffle(&mut edge_pool);
    for (position, piece) in non_cross.iter().zip(edge_pool.iter()) {
        edge_perm[*position] = *piece;
    }
    if permutation_parity(&corner_perm) != permutation_parity(&edge_perm) {
        edge_perm.swap(non_cross[0], non_cross[1]);
    }

    let mut corner_ori = [0u8; 8];
    for position in 0..8 {
        corner_ori[position] = (rng.next() % 3) as u8;
    }
    // The final non-F2L corner absorbs the twist needed to retain the legal
    // twist-sum invariant. Do not force any particular F2L orientation.
    let corner_adjust = (0..8)
        .find(|position| !f2l_corner_positions.contains(position))
        .unwrap();
    let corner_sum = (0..8)
        .filter(|position| *position != corner_adjust)
        .fold(0u8, |sum, position| (sum + corner_ori[position]) % 3);
    corner_ori[corner_adjust] = (3 - corner_sum) % 3;

    let mut edge_ori = [0u8; 12];
    for position in &non_cross {
        edge_ori[*position] = (rng.next() & 1) as u8;
    }
    // The final non-F2L, non-cross edge absorbs the legal flip parity. F2L
    // edge orientations are sampled freely.
    let edge_adjust = non_cross
        .iter()
        .find(|position| !f2l_edge_positions.contains(position))
        .copied()
        .unwrap();
    let edge_sum = non_cross
        .iter()
        .filter(|position| **position != edge_adjust)
        .fold(0u8, |sum, position| (sum + edge_ori[*position]) % 2);
    edge_ori[edge_adjust] = edge_sum;

    let pair_data: Vec<(usize, usize)> = f2l_corner_positions
        .iter()
        .map(|corner_position| {
            let side_faces: Vec<&str> = CORNERS[*corner_position]
                .faces
                .iter()
                .copied()
                .filter(|candidate| *candidate != bottom)
                .collect();
            let edge_position = EDGE_SPECS
                .iter()
                .position(|edge| {
                    contains_face(&edge.faces, side_faces[0])
                        && contains_face(&edge.faces, side_faces[1])
                })
                .unwrap();
            (*corner_position, edge_position)
        })
        .collect();
    let corners: Vec<F2lCorner> = corner_perm
        .iter()
        .enumerate()
        .map(|(position, piece)| {
            let position_spec = &CORNERS[position];
            let home = &CORNERS[*piece];
            let mut stickers = position_spec.faces.map(sticker);
            for (slot, current) in stickers.iter_mut().enumerate() {
                current.color = home.faces[(slot + corner_ori[position] as usize) % 3].to_owned();
            }
            F2lCorner {
                id: home.name.to_owned(),
                home_position: home.name.to_owned(),
                position: position_spec.name.to_owned(),
                orientation: corner_ori[position],
                stickers,
            }
        })
        .collect();
    let edges: Vec<F2lEdge> = edge_perm
        .iter()
        .enumerate()
        .map(|(position, piece)| {
            let position_spec = &EDGE_SPECS[position];
            let home = &EDGE_SPECS[*piece];
            let stickers = [
                Sticker {
                    face: position_spec.faces[0].to_owned(),
                    color: home.faces[if edge_ori[position] == 0 { 0 } else { 1 }].to_owned(),
                },
                Sticker {
                    face: position_spec.faces[1].to_owned(),
                    color: home.faces[if edge_ori[position] == 0 { 1 } else { 0 }].to_owned(),
                },
            ];
            F2lEdge {
                id: home.name.to_owned(),
                home_position: home.name.to_owned(),
                position: position_spec.name.to_owned(),
                orientation: edge_ori[position],
                stickers,
            }
        })
        .collect();
    let pairs = pair_data
        .iter()
        .enumerate()
        .map(|(id, (corner_position, edge_position))| {
            let corner_home = CORNERS[*corner_position].name;
            let edge_home = EDGE_SPECS[*edge_position].name;
            // Pair members are identified by their home cubie IDs; locate
            // those cubies at their actual current positions, not at the
            // solved/home slots used to define the pair.
            let corner = corners
                .iter()
                .find(|piece| piece.id == corner_home)
                .unwrap();
            let edge = edges.iter().find(|piece| piece.id == edge_home).unwrap();
            F2lPair {
                id: id as u8,
                corner: corner_home.to_owned(),
                edge: edge_home.to_owned(),
                corner_position: corner.position.clone(),
                edge_position: edge.position.clone(),
                corner_orientation: corner.orientation,
                edge_orientation: edge.orientation,
                solved: corner.position == corner_home
                    && edge.position == edge_home
                    && corner.orientation == 0
                    && edge.orientation == 0,
            }
        })
        .collect();
    let centers = FACE_ORDER.map(sticker);
    F2lCase {
        id: format!("f2l-{}-{:016x}", bottom, seed),
        seed,
        bottom_face: bottom.to_owned(),
        opposite_face: opposite_face.to_owned(),
        cross_solved: cross_positions
            .iter()
            .all(|position| edge_perm[*position] == *position && edge_ori[*position] == 0),
        cross_edges: cross_positions
            .iter()
            .map(|position| EDGE_SPECS[*position].name.to_owned())
            .collect(),
        f2l_corner_positions: f2l_corner_positions
            .iter()
            .map(|position| CORNERS[*position].name.to_owned())
            .collect(),
        f2l_edge_positions: f2l_edge_positions
            .iter()
            .map(|position| EDGE_SPECS[*position].name.to_owned())
            .collect(),
        centers,
        corners,
        edges,
        pairs,
        facelets: build_facelets(&corner_perm, &corner_ori, &edge_perm, &edge_ori),
        corner_permutation_parity: permutation_parity(&corner_perm),
        edge_permutation_parity: permutation_parity(&edge_perm),
        corner_twist_sum: corner_ori.iter().fold(0, |sum, value| (sum + value) % 3),
        edge_flip_sum: edge_ori.iter().fold(0, |sum, value| (sum + value) % 2),
    }
}

fn build_f2l_case(seed: u64, requested_bottom: &str) -> F2lCase {
    // Solved pairs are uninteresting objectives. Rejection keeps the
    // distribution of all other legal states unbiased while guaranteeing the
    // four generated F2L pairs are unsolved.
    let bottom_index =
        face_index(requested_bottom).unwrap_or_else(|| (next_seed(seed ^ 0x4e) % 6) as usize);
    let bottom = FACE_ORDER[bottom_index];
    for attempt in 0u64.. {
        let trial_seed = seed.wrapping_add(attempt.wrapping_mul(0x9e37_79b9_7f4a_7c15));
        let mut case = build_f2l_case_once(trial_seed, bottom);
        if case.pairs.iter().all(|pair| !pair.solved) {
            case.seed = seed;
            case.id = format!("f2l-{}-{:016x}", bottom, seed);
            return case;
        }
    }
    unreachable!()
}

/// Generate a deterministic legal F2L state. Pass `"neutral"` (or an empty
/// string) to choose the bottom face from the seed; explicit U/D/F/B/R/L
/// requests always use that face.
#[wasm_bindgen]
pub fn f2l_case(seed: u64, bottom_face_or_neutral: &str) -> String {
    json(&build_f2l_case(seed, bottom_face_or_neutral))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_cases_have_unique_ids_and_expected_shape() {
        let cases: Vec<CornerCase> = (0..CASE_COUNT).map(case_at).collect();
        let ids: std::collections::BTreeSet<_> = cases.iter().map(|case| case.id.clone()).collect();
        assert_eq!(ids.len(), CASE_COUNT as usize);
        assert!(cases
            .iter()
            .all(|case| case.hidden_corners && case.edges.len() == 12));
    }

    #[test]
    fn random_generation_is_reproducible() {
        assert_eq!(random_case(42), random_case(42));
        assert_ne!(random_case(42), random_case(43));
    }

    #[test]
    fn corner_cycles_match_the_standard_color_scheme() {
        let expected = [
            ["U", "R", "F"],
            ["U", "B", "R"],
            ["U", "L", "B"],
            ["U", "F", "L"],
            ["D", "F", "R"],
            ["D", "L", "F"],
            ["D", "B", "L"],
            ["D", "R", "B"],
        ];
        for (index, faces) in expected.iter().enumerate() {
            assert_eq!(CORNERS[index].faces, *faces);
            let generated = case_at((index * 3) as u8);
            assert_eq!(
                generated.stickers.map(|sticker| sticker.face),
                faces.map(str::to_owned)
            );
        }
    }

    #[test]
    fn scoring_and_weak_case_ranking_work() {
        let history = score_attempt("URF-o0", 1000.0, true, "{}");
        let history = score_attempt("UBR-o0", 4000.0, false, &history);
        let weak = weak_cases(&history, CASE_COUNT);
        let weak: Vec<WeakCase> = serde_json::from_str(&weak).unwrap();
        let good = weak.iter().find(|case| case.id == "URF-o0").unwrap();
        let bad = weak.iter().find(|case| case.id == "UBR-o0").unwrap();
        assert!(bad.weakness > good.weakness);
        assert_eq!(weak.len(), CASE_COUNT as usize);
    }

    #[test]
    fn f2l_explicit_bottoms_preserve_the_cross() {
        for bottom in ["U", "D", "F", "B", "R", "L"] {
            let case: F2lCase = serde_json::from_str(&f2l_case(101, bottom)).unwrap();
            assert_eq!(case.bottom_face, bottom);
            assert!(case.cross_solved);
            assert_eq!(case.facelets.len(), 54);
            assert_eq!(case.corner_permutation_parity, case.edge_permutation_parity);
            assert_eq!(case.corner_twist_sum, 0);
            assert_eq!(case.edge_flip_sum, 0);
            assert_eq!(case.pairs.len(), 4);
            assert!(case.pairs.iter().all(|pair| !pair.solved));
            let unique_corners: std::collections::BTreeSet<_> =
                case.corners.iter().map(|piece| piece.id.as_str()).collect();
            let unique_edges: std::collections::BTreeSet<_> =
                case.edges.iter().map(|piece| piece.id.as_str()).collect();
            assert_eq!(unique_corners.len(), 8);
            assert_eq!(unique_edges.len(), 12);
            for cross in &case.cross_edges {
                let edge = case
                    .edges
                    .iter()
                    .find(|piece| piece.position == *cross)
                    .unwrap();
                assert_eq!(edge.id, *cross);
                assert_eq!(edge.orientation, 0);
            }
        }
    }

    #[test]
    fn f2l_neutral_bottom_is_seeded_and_case_is_replayable() {
        let first: F2lCase = serde_json::from_str(&f2l_case(7, "neutral")).unwrap();
        let replay: F2lCase = serde_json::from_str(&f2l_case(7, "")).unwrap();
        assert_eq!(first.bottom_face, replay.bottom_face);
        assert_eq!(f2l_case(7, "neutral"), f2l_case(7, ""));

        let bottoms: std::collections::BTreeSet<_> = (1..32)
            .map(|seed| {
                serde_json::from_str::<F2lCase>(&f2l_case(seed, "neutral"))
                    .unwrap()
                    .bottom_face
            })
            .collect();
        assert!(bottoms.len() > 1);
    }

    #[test]
    fn f2l_pairs_report_actual_member_positions() {
        let mut oriented_but_displaced = 0;
        for bottom in ["U", "D", "F", "B", "R", "L"] {
            for seed in 1..80 {
                let case: F2lCase = serde_json::from_str(&f2l_case(seed, bottom)).unwrap();
                assert!(case.cross_solved);
                assert_eq!(case.facelets.len(), 54);
                assert_eq!(case.corner_permutation_parity, case.edge_permutation_parity);
                assert_eq!(case.corner_twist_sum, 0);
                assert_eq!(case.edge_flip_sum, 0);
                for pair in &case.pairs {
                    let corner = case
                        .corners
                        .iter()
                        .find(|piece| piece.id == pair.corner)
                        .unwrap();
                    let edge = case
                        .edges
                        .iter()
                        .find(|piece| piece.id == pair.edge)
                        .unwrap();
                    assert_eq!(pair.corner_position, corner.position);
                    assert_eq!(pair.edge_position, edge.position);
                    assert_eq!(pair.corner_orientation, corner.orientation);
                    assert_eq!(pair.edge_orientation, edge.orientation);
                    assert_eq!(
                        pair.solved,
                        corner.position == corner.home_position
                            && edge.position == edge.home_position
                            && corner.orientation == 0
                            && edge.orientation == 0
                    );
                    if corner.orientation == 0 && edge.orientation == 0 {
                        oriented_but_displaced += 1;
                    }
                    assert!(!pair.solved);
                }
            }
        }
        assert!(
            oriented_but_displaced > 0,
            "Unsolved pairs may have both orientations zero; do not filter them out."
        );
    }
}
