---
id: solve-connect-keys
title: Solve · centered connection keys
date: 2026-10-09
branch: solve
parent: orbit-v3
status: built
author: Codex
decision: Remove the connection hint; center Space/Tab and raise them slightly, as requested.
images: [SL-01-dark.png, SL-02-light.png, SL-03-dark.png]
---
Space/Tab sit centered, 32 design pixels higher. The redundant connection sentence is gone.
Dark, light, and phone checks use the test cube placeholder. Keyboard hints stay hidden on phones.
Cancelled pairing shows no error; genuine failures appear once in the dismissible bottom-right toast.
