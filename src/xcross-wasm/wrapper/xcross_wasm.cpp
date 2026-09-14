#include "xcross_wasm.h"

#include "xcross/xcross.h"
#include <vector>

#include <new>
#include <system_error>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define XCROSS_KEEPALIVE EMSCRIPTEN_KEEPALIVE
#else
#define XCROSS_KEEPALIVE
#endif

namespace {
xcross_wasm_result wasm_solve_impl(
    const char *scramble,
    int slot,
    unsigned char max_depth,
    char *algorithm,
    size_t algorithm_capacity) {
  xcross_wasm_result result{XCROSS_INVALID_ARGUMENT, 0, 0};
  if (scramble == nullptr || slot < -1 || slot > 3) {
    return result;
  }

  xcross_state state;
  xcross_solved_state(&state);
  result.status = xcross_apply_scramble(&state, scramble, &result.error_offset);
  if (result.status != XCROSS_OK) {
    return result;
  }
  const xcross_goal goal =
      slot < 0 ? xcross_goal_d_cross() : xcross_goal_d_xcross(static_cast<uint8_t>(slot));
  const xcross_solve_options options{
      sizeof(xcross_solve_options), max_depth, {0, 0, 0}};
  size_t required_size = 0;
  result.status = xcross_solve(
      &state,
      &goal,
      &options,
      algorithm,
      algorithm_capacity,
      &required_size,
      &result.depth);
  return result;
}

}  // namespace

extern "C" XCROSS_KEEPALIVE xcross_wasm_result xcross_wasm_solve(
    const char *scramble,
    int slot,
    unsigned char max_depth,
    char *algorithm,
    size_t algorithm_capacity) {
  try {
    return wasm_solve_impl(
        scramble, slot, max_depth, algorithm, algorithm_capacity);
  } catch (const std::bad_alloc &) {
    return {XCROSS_OUT_OF_MEMORY, 0, 0};
  } catch (const std::system_error &) {
    return {XCROSS_SYSTEM_ERROR, 0, 0};
  } catch (...) {
    return {XCROSS_INTERNAL_ERROR, 0, 0};
  }
}

// String boundary avoids the platform-dependent hidden return pointer used by
// C ABIs for structs, making this wrapper callable from JavaScript directly.
extern "C" XCROSS_KEEPALIVE const char* xcross_wasm_solve_json(
    const char *scramble, int slot, unsigned char max_depth) {
  static std::string response;
  char algorithm[XCROSS_MAX_SOLUTION] = {};
  const auto result = xcross_wasm_solve(scramble, slot, max_depth, algorithm, sizeof(algorithm));
  response = "{\"status\":" + std::to_string(result.status) +
             ",\"depth\":" + std::to_string(result.depth) +
             ",\"algorithm\":\"" + std::string(algorithm) + "\"}";
  return response.c_str();
}

extern "C" XCROSS_KEEPALIVE const char* xcross_wasm_analyze_json(
    const char *scramble, unsigned char face, unsigned char slot_mask,
    unsigned char max_depth, unsigned short max_candidates, uint32_t timeout_ms) {
  static std::string response;
  xcross_state state; xcross_solved_state(&state); size_t offset = 0;
  auto status = xcross_apply_scramble(&state, scramble, &offset);
  xcross_goal_v3 goal{}; goal.struct_size = sizeof(goal);
  if (status == XCROSS_OK) status = xcross_goal_make_v3(face, slot_mask, &goal);
  std::vector<xcross_candidate> candidates(max_candidates ? max_candidates : 1);
  xcross_analysis_result result{}; result.struct_size = sizeof(result);
  result.candidate_capacity = static_cast<uint32_t>(candidates.size());
  result.candidates = candidates.data();
  xcross_solve_options_v2 options{sizeof(options), max_depth, XCROSS_SOLVE_OPTIMAL,
                                  static_cast<uint16_t>(candidates.size()), XCROSS_ALL_MOVES_MASK,
                                  timeout_ms, nullptr, nullptr};
  if (status == XCROSS_OK) status = xcross_solve_v3(&state, &goal, &options, &result);
  response = "{\"status\":" + std::to_string(status) + ",\"results\":[";
  for (uint32_t i=0; i<result.candidate_count; ++i) {
    if (i) response += ','; response += "{\"moves\":[";
    for (uint8_t j=0; j<candidates[i].move_count; ++j) {
      if (j) response += ','; response += '\"'; response += xcross_move_name(candidates[i].moves[j]); response += '\"';
    }
    response += "],\"slot\":" + std::to_string(candidates[i].slot) + ",\"optimality\":\"";
    response += status == XCROSS_OK ? "proven\"}" : "unknown\"}";
  }
  response += "]}"; return response.c_str();
}
