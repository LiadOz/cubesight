/* tslint:disable */
/* eslint-disable */

/**
 * Return the complete catalog, useful for populating a case filter.
 */
export function case_catalog(): string;

/**
 * Number of canonical corner-position/orientation cases.
 */
export function case_count(): number;

/**
 * Generate a deterministic legal F2L state. Pass `"neutral"` (or an empty
 * string) to choose the bottom face from the seed; explicit U/D/F/B/R/L
 * requests always use that face.
 */
export function f2l_case(seed: bigint, bottom_face_or_neutral: string): string;

/**
 * Generate a canonical case by index. Indices wrap, so UI state can safely
 * increment/decrement without a separate bounds check.
 */
export function generate_case(index: number): string;

/**
 * Generate a reproducible case from a seed. The returned `seed` is not
 * exposed in the case itself; callers can retain their seed if replay is
 * needed and pass it again for the same result.
 */
export function random_case(seed: bigint): string;

/**
 * Record one timed recognition attempt and return the updated history.
 * Invalid/negative times are treated as zero; malformed history starts fresh.
 */
export function score_attempt(case_id: string, elapsed_ms: number, correct: boolean, history_json: string): string;

/**
 * Rank cases by weakness. Untested cases are included first, followed by
 * cases with low accuracy and slower mean recognition times. This makes the
 * result directly usable for weighted practice queues.
 */
export function weak_cases(history_json: string, limit: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly case_catalog: () => [number, number];
    readonly case_count: () => number;
    readonly f2l_case: (a: bigint, b: number, c: number) => [number, number];
    readonly generate_case: (a: number) => [number, number];
    readonly random_case: (a: bigint) => [number, number];
    readonly score_attempt: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly weak_cases: (a: number, b: number, c: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
