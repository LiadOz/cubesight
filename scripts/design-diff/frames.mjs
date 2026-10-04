// THE mapping table: approved Orbit-v3 direction-A frame -> how to put the live app into that state.
//
//   frame    output folder / approved frame name
//   ref      PNG in docs/design/orbit-v3/ and the crop taken from it (phone frames are 900x900 sheets with two
//            390x844 phones at (40,28) and (470,28); every phone is one entry, suffix a = left, b = right)
//   viewport live viewport, equal to the crop size
//   route    hash route the app is opened on
//   driver   how the state is reached, reusing the Tier 2 snapshot drivers in tests/layout/state-drivers.js:
//              { fixture: '<id>' }  a registered layout state (fake smart cube replayed through the real session)
//              { seed: true }       HISTORY_SEED in localStorage, then plain navigation
//              { seed: 'rich', replayFraction? }  the 23-solve history of rich-seed.mjs (what the history frames show),
//                                   optionally stepped to that fraction of the replay
//              UNREACHABLE: '<reason>'  the state cannot be produced today; the frame is reported, not faked
// 17:33 UTC on the harness's fixed day: solve 23, the newest, which the history frames select.
export const RICH_AT = Date.UTC(2026, 0, 15, 17, 33);
export const FRAMES = [
  { frame: 'A-01-idle', ref: 'A-01-idle.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'idle' } },
  { frame: 'A-02-scramble', ref: 'A-02-scramble.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'guided-scramble' } },
  { frame: 'A-02b-wrong-turn', ref: 'A-02b-wrong-turn.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'wrong-turn' } },
  { frame: 'A-03-inspection', ref: 'A-03-inspection.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'inspection' } },
  { frame: 'A-04-solving', ref: 'A-04-solving.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'solving' } },
  { frame: 'A-05-results', ref: 'A-05-results.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'results' } },
  { frame: 'A-06-review', ref: 'A-06-review.png', viewport: [1440, 900], route: '/solve', driver: { fixture: 'review-detail' } },
  { frame: 'A-07-history', ref: 'A-07-history.png', viewport: [1440, 900], route: '/history', driver: { seed: 'rich' } },
  { frame: 'A-08-drill', ref: 'A-08-drill.png', viewport: [1440, 900], route: '/drills/oll', driver: { seed: true } },
  { frame: 'A-09a-phone-solving', ref: 'A-09-phone.png', crop: [40, 28], viewport: [390, 844], route: '/solve', driver: { fixture: 'solving' } },
  { frame: 'A-09b-phone-results', ref: 'A-09-phone.png', crop: [470, 28], viewport: [390, 844], route: '/solve', driver: { fixture: 'results' } },
  { frame: 'A-10-past-solve', ref: 'A-10-past-solve.png', viewport: [1440, 900], route: `/history/${RICH_AT}`, driver: { seed: 'rich' } },
  { frame: 'A-11-replay', ref: 'A-11-replay.png', viewport: [1440, 900], route: `/history/${RICH_AT}/replay`, driver: { seed: 'rich', replayFraction: 0.559 } },
  { frame: 'A-12a-phone-past', ref: 'A-12-phone-past.png', crop: [40, 28], viewport: [390, 844], route: `/history/${RICH_AT}`, driver: { seed: 'rich' } },
  { frame: 'A-12b-phone-replay', ref: 'A-12-phone-past.png', crop: [470, 28], viewport: [390, 844], route: `/history/${RICH_AT}/replay`, driver: { seed: 'rich', replayFraction: 0.559 } },
];

// Corner radius of the phone bezel in the reference sheets; pixels outside it are ignored.
export const PHONE_RADIUS = 46;
