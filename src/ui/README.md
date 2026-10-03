# Shared CubeSight UI foundation

All components are DOM views, not route owners. Create each component once and update it as its page state changes. `Orbit` owns one SVG and `Cube` owns one WebGL canvas for its lifetime.

## Orbit

```js
const orbit = new Orbit(host, {
  segments: [{ key, label, value, delta, weight, fill, state, importance }],
  markers: [{ key, segment, position, angle, label, tone, type }],
  sections: [{ start, label }],
  shape: 'open' | 'full', gap: 70, start: 180,
  direction: 'clockwise' | 'counterclockwise',
  size: 'XL' | 'L' | 'M' | 'S' | 'mini', glyphSize: 38,
  labelStyle: 'around' | 'side', caret, duration: 360, label,
  onSegment(segment, event), onSegmentHover(segment, event),
  onMarker(marker, event), onMarkerHover(markers, event),
  onMarkerCluster(markers, event),
});
await orbit.update(nextOptions, { animate: true });
await orbit.collapse();       // full, mini glyph
await orbit.expand('L');      // open dial
orbit.getMarkerElement(key);  // exact key lookup; works for clustered markers
orbit.destroy();
```

`update`, `collapse`, and `expand` return promises. Starting another update interrupts the previous morph and settles its promise. Reduced motion applies the final geometry immediately. Segment keys and focus survive an update; Enter/Space activate segments and markers. `createOrbit(host, options)` constructs an `Orbit`. `createMiniOrbit(host, { label, value, size, ...orbitOptions })` returns `{ element, orbit, update(), destroy() }`; its glyph is 17–48 px and its text sits beside it.

Segment state accepts `future`, `current`, `done`, `skipped`, `wrong`, `good`, or `bad`. `weight` allocates angular span, `fill` paints a fractional arc, and `importance` decides which labels keep collision-free space when labels are dense. Section starts add a visible gap. Markers within five degrees cluster; pointer hover, click, Enter, and Space expand a cluster.

## Cube

```js
const cube = new Cube(host, {
  mode: 'live' | 'case' | 'replay', state, size: 'XS' | 'S' | 'M' | 'L' | 'XL',
  caseColorSetting: 'yellow top' | 'white top' | 'yellow or white' | 'any colour' | 'fixed: red',
  caseSeed, label, cubeOptions,
});
cube.setMode(mode);
cube.setState(state); cube.setMoves(moves, { startState });
cube.highlight({ pieces: ['UFR'], slot: 'cross' | 'pair:FR' | 'UFR', dimOthers: true });
cube.cue(move); cube.clearCue();
const unbind = cube.bindSession(session); // state + gyro subscription
cube.mount(otherHost);                  // reparents the same canvas
cube.update(renderData); cube.animateMove(move, nextState); cube.queueLiveMove(move, nextState);
await cube.play(moves, { fullTurns: true, speed: 1, startState });
cube.seek(position, moves, { startState }); cube.stop();
cube.setCaseOrientation(setting, { seed });
cube.destroy();
```

Playback cancellation uses a generation token: `seek`, `stop`, a new playback, or `destroy` prevents an awaited older turn from painting later. Case presentation recolors a cloned render state, leaving the source state, U-layer positions, sticker faces, and logical move notation intact. The selected case color is stable for its seed through repaint, retheme, highlight and full-turn playback. `resolveSlotPieces(state, slot)` resolves cross, pair and canonical piece labels to cubie IDs.

## Shared pieces

```js
createHeader(host, { title, sections, active, session, actions, help, themeToggle, showDevDrawer });
createKeyBar(host, [{ key, label }]); // displays at most three
createCoachLine(host, { text, marker, orbit }); // returns element, sentence, link, update, destroy
createActions(host, [{ label, onClick, href, primary }]); // displays at most three
createChip(host, { label, value, pressed, onClick });
```

The global header uses the shared session snapshot and neutral connection phases. Its menu actions are named `connect`, `sync`, `recenter`, `disconnect`, `forget`, `save-recording`, and `report-problem`. `createCoachLine` takes an Orbit marker key or marker object; it resolves the exact key after every Orbit morph and repositions its dotted connector after scroll and resize.

The gallery at `gallery.html` uses one live Cube across all nine flow fixtures. Add visual examples there before introducing a page-specific Orbit or Cube pattern.
