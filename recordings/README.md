# Recordings

Smart-cube recordings from real sessions, kept here so agents working in sandboxes
(which can't see `~/Downloads`) can replay them:

    node scripts/replay-recording.mjs recordings/<file>.json

Recordings are anonymized when saved (the cube name becomes a generic alias, MAC
addresses and device ids are masked, the browser string is coarsened), so they can
be shared. They are not committed: this directory is gitignored except this file.
