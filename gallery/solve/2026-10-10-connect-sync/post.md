---
id: solve-connect-sync
title: Solve · continuous connection and solved-cube sync
date: 2026-10-10
branch: solve
parent: solve-connect-keys
status: built
author: Codex
decision: Preserve the connection sweep across stages; make a stale cube report recoverable with explicit sync.
images: [CS-07-dark.png, CS-08-light.png, CS-09-dark.png]
---
One continuous sweep through the Bluetooth handshake. An unsolved report stops the sweep and asks for sync.
If your cube is physically solved, “sync solved cube” resets its internal state and verifies a fresh solved report.
Dark, light, and phone captures show this waiting state with the test cube placeholder.
