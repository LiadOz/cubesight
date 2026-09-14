cmake_minimum_required(VERSION 3.20)
project(cubesight_xcross_wasm LANGUAGES CXX)
if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure with emcmake and Emscripten 6.0.9")
endif()
set(XCROSS_CORE_DIR "" CACHE PATH "Pinned cube-xcross checkout")
if(NOT EXISTS "${XCROSS_CORE_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "Set XCROSS_CORE_DIR to the cube-xcross checkout")
endif()
add_subdirectory("${XCROSS_CORE_DIR}" xcross-core EXCLUDE_FROM_ALL)
add_executable(cubesight_xcross xcross_wasm.cpp)
target_compile_features(cubesight_xcross PRIVATE cxx_std_17)
target_include_directories(cubesight_xcross PRIVATE "${XCROSS_CORE_DIR}/bindings/wasm/include")
target_link_libraries(cubesight_xcross PRIVATE xcross::xcross)
set_target_properties(cubesight_xcross PROPERTIES OUTPUT_NAME "xcross" SUFFIX ".js")
target_link_options(cubesight_xcross PRIVATE
  "SHELL:-s MODULARIZE=1"
  "SHELL:-s EXPORT_ES6=1"
  "SHELL:-s ALLOW_MEMORY_GROWTH=1"
  "SHELL:-s EXPORTED_FUNCTIONS=['_xcross_wasm_solve','_xcross_wasm_solve_json','_xcross_wasm_analyze_json','_malloc','_free']"
  "SHELL:-s EXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToUTF8','lengthBytesUTF8']"
)
