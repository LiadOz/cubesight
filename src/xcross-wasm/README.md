# cube-xcross WASM bundle

This directory contains the generated Emscripten Lite browser artifact from
[vangie/cube-xcross](https://github.com/vangie/cube-xcross), MIT licensed,
pinned to commit `ddeea840eda743a826d92530821e90294130944a`.
The source wrapper is retained at `wrapper/xcross_wasm.cpp`.

Install and activate Emscripten 6.0.9. Clone upstream separately and check out
the pinned commit. From the Cubesight repository root, build the retained
bridge (no upstream source patches required):

```sh
emcmake cmake -S src/xcross-wasm/wrapper -B /path/to/build \
  -DCMAKE_BUILD_TYPE=Release -DXCROSS_CORE_DIR=/path/to/cube-xcross
cmake --build /path/to/build --target cubesight_xcross --parallel 2
```

The generated `xcross.js` and `xcross.wasm` replace the matching files in this
directory. Keep the upstream MIT license alongside distributed artifacts.

The bridge exports JSON helpers for Cross (`slot_mask=0`), XCross (each of the
four single-bit masks), and 2XCross (all six two-bit masks), on all six faces,
with a millisecond timeout parameter. Search runs synchronously inside
`cross-solver-worker.js`; worker termination provides an additional hard
cancellation boundary. Startup/table initialization may exceed a search slice.
Every candidate is separately checked by the application’s geometric cube
model before it is displayed. No upstream generated server tables are bundled.
