// Brain v2 contract: the view-model the controller produces and the component
// APIs the style modules implement. The logic (view-model.js, controller.js)
// and the two visual styles (styles/orbit, styles/mono) are built against this
// file; change it only together with every consumer.
//
// Data flow: session + live snapshots, records, settings -> buildViewModel()
// -> shell.update(vm, prev) and each style component's update(vm, prev).
// Between emits a rAF loop (timing screens only) calls frame(frameState(vm, now))
// to move the clock, the current segment fill and the inspection caret.
// Components compare slices by identity (vm.x !== prev?.x) and update the DOM
// in place (see dom.js); no innerHTML in update paths.

/** Brain styles. Orbit is the default. The dark/light mode is the site-wide
 * document.documentElement.dataset.theme (src/theme.js). */
export const BRAIN_STYLES = ['orbit', 'mono'];
export const DEFAULT_BRAIN_STYLE = 'orbit';

/** @typedef {'mono'|'orbit'} BrainStyle */
/** @typedef {'dark'|'light'} ThemeMode */
/** @typedef {'faster'|'slower'|'even'|'none'} DeltaTone */
/** @typedef {'disconnected'|'connecting'|'idle'|'scramble'|'inspection'|'ready'|'solving'|'results'|'desynced'} Screen */

/** @typedef {Object} BrainVM
 * @property {number} rev
 * @property {BrainStyle} style
 * @property {ThemeMode} theme
 * @property {Screen} screen
 * @property {{label:string, detail:string}} phaseText   legacy strings for #brain-phase-label / #brain-phase-detail
 * @property {DeviceVM} device
 * @property {ConfigBarVM} configBar
 * @property {SettingsPanelVM} settings
 * @property {ScrambleVM|null} scramble
 * @property {ClockVM} clock
 * @property {InspectionVM|null} inspection
 * @property {TimelineVM} timeline
 * @property {CoachLine[]} coach
 * @property {ResultsVM|null} results
 * @property {StatsVM} stats
 * @property {KeyHint[]} keys
 * @property {{text:string, tone:'info'|'error'}|null} toast   e.g. "✦ eo skip"
 * @property {string} status    aria-live status
 * @property {string} error     #brain-error
 * @property {boolean} chromeDimmed   Mono: top bar dims while scramble/inspection/solving
 * @property {boolean} commandOpen    true on the render after esc asks for the command line (the shell focuses it)
 * @property {boolean} debugOpen      the debug drawer (connection log, recordings, coach switches, data) is open
 */

/** @typedef {Object} DeviceVM
 * @property {'disconnected'|'connecting'|'syncing'|'tracking'|'desynced'} phase
 * @property {string} name
 * @property {string} protocol
 * @property {number|null} battery
 * @property {boolean} supported
 * @property {boolean} gyro
 * @property {string} detail   while connecting: the latest step of the attach
 * @property {boolean} busy     connecting, or checking the cube's first state
 * @property {boolean} failed   the last attempt failed (detail has the reason; connect again to retry)
 * @property {{connect:boolean, sync:boolean, recenter:boolean, disconnect:boolean, clearSaved:boolean, reconnect:boolean, resume:boolean}} actions
 */

/** @typedef {Object} ScrambleVM
 * @property {'guided'|'paste'|'free'} source
 * @property {{key:string, text:string, state:'done'|'current'|'todo'}[]} moves      keys s0..sN
 * @property {{key:string, text:string, state:'current'|'todo'}[]|null} recovery   keys r0..; from recoveryMoves()
 * @property {string|null} wrongTurn   e.g. "L" (was L′)
 * @property {number} step
 * @property {number} total
 * @property {boolean} editable
 * @property {string} text   current scramble text
 * @property {number} [number] this session's scramble count ("scramble 24")
 */

/** @typedef {Object} ClockVM
 * @property {string} text
 * @property {number|null} ms
 * @property {number|null} startedAt   clock origin; frameState computes now - startedAt
 * @property {boolean} running
 * @property {boolean} hidden          settings.timer === 'hide' while solving
 * @property {'text'|'accent'|'warn'|'error'} tone
 * @property {string} sub              "31 moves · 4.49 tps"
 * @property {{text:string, tone:'accent'|'sub'}[]} stepLine   "f2l · pair 3 · pseudo · d′ aligned"
 * @property {string} stepTitle        Orbit: "Pair 3"
 * @property {string[]} stepTags       ['pseudo · D′ shift']
 */

/** @typedef {Object} InspectionVM
 * @property {'wca'|'custom'|'unlimited'|'off'} mode
 * @property {'wca'|'count'|'grace'|'autostart'} overtime
 * @property {number|null} limitMs
 * @property {number} elapsedMs
 * @property {number|null} remainingMs
 * @property {number} overtimeMs
 * @property {null|'+2'|'DNF'} penalty
 * @property {null|8|12} callout
 * @property {number} scaleMs          full scale of the lane/ring (wca 17000, custom N+2000, unlimited 60000 per lap)
 * @property {{kind:'normal'|'plus2'|'dnf'|'grace'|'count', fromMs:number, toMs:number|null}[]} zones
 * @property {{atMs:number, label:string, kind:'callout'|'count'|'limit', passed:boolean}[]} ticks
 * @property {string} bigText          "8" | "+1"
 * @property {'accent'|'warn'|'error'} tone
 * @property {string} consequence      "starting now = +2 penalty · dnf in 1.2 s"
 * @property {boolean} autostartHandoff
 * @property {number|null} startedAt   frameState recomputes elapsed/remaining per frame
 */

/** @typedef {Object} SegmentVM
 * @property {string} key      'cross'|'pair1'..'pair4'|'f2l'|'eo'|'co'|'oll'|'cp'|'ep'|'pll'|'fb'|'sb'|'cmll'|'l6e'
 * @property {string} label    'pair 3'
 * @property {string} short    'p3'
 * @property {string|null} group   'f2l'|'oll'|'pll'|null
 * @property {number} weight   avgMs / totalAvgMs (weights sum to 1)
 * @property {number} avgMs
 * @property {'history'|'default'} avgSource
 * @property {'future'|'current'|'done'|'skipped'} state
 * @property {number} fill     0..1 at emit time; frame() refines the current segment
 * @property {number|null} startedAt
 * @property {number|null} splitMs
 * @property {string} splitText   '1.96' | 'skip'
 * @property {{ms:number, text:string, tone:DeltaTone}|null} delta   vs avg | vs pb | null
 * @property {number|null} moves
 * @property {string[]} tags   ['pseudo'], and 'x-cross' / 'xx-cross' on a cross that completed together with pairs
 * @property {boolean} merged   a pair built together with the cross (done at the cross's moment; not a skip)
 * @property {string|null} xcross   'x-cross' | 'xx-cross' | … on the cross segment when pairs came with it
 * @property {{label:string, fresh:boolean}|null} skip   fresh on the emit it happened (animate once)
 * @property {boolean} over    live split > avg
 */

/** @typedef {Object} TimelineVM
 * @property {boolean} visible
 * @property {boolean} ghost     idle/scramble/inspection preview
 * @property {string} planKey    changes => rebuild structure
 * @property {{id:string, label:string, sub:string, from:number, to:number}[]} groups   segment index ranges
 * @property {SegmentVM[]} segments
 * @property {number} currentIndex
 * @property {number} totalAvgMs
 * @property {{text:string}|null} insp   "insp 8.7" after the first turn
 * @property {{now:number, max:number, text:string}} aria
 */

/** @typedef {Object} ResultsVM
 * @property {string} key   record.at; results rebuild when it changes
 * @property {{text:string, resultText:string, penalty:null|'+2'|'DNF', tone:'accent'|'warn'|'error'}} time
 * @property {string} moves
 * @property {string} tps
 * @property {string} inspection
 * @property {string} method
 * @property {{text:string, tone:DeltaTone}|null} vsAo12
 * @property {TpsSeries} tpsSeries
 * @property {SplitRow[]} splits
 * @property {{centerValue:string, centerLabel:string, arcs:{key:string, label:string, fraction:number, tone:DeltaTone|'skip'}[]}} donut
 * @property {{ao5:string, ao12:string, pb:string, mean:string, tones:Object<string, DeltaTone>,
 *   count:number, worst:string, mo3:string, ao50:string, ao100:string}} session   this solve's automatic session
 * @property {{points:{i:number, ms:number|null, kind:'normal'|'plus2'|'dnf'|'pb'|'current'}[], min:number, max:number}} spark
 * @property {{key:string, text:string, penaltyTag:string, current:boolean}[]} recent
 * @property {{key:string, tag:string, text:string, alg?:string, tone:'good'|'warn'|'info'}[]} coach
 */

/** @typedef {{points:{tMs:number, tps:number}[], avg:{fromMs:number, toMs:number, tps:number}[], avgFlat:number|null,
 *   bands:{key:string, label:string, fromMs:number, toMs:number}[], marks:{tMs:number, kind:'pause'|'skip', label:string}[],
 *   durationMs:number, maxTps:number}} TpsSeries */
/** @typedef {{key:string, label:string, ms:number|null, text:string, deltaText:string, tone:DeltaTone, moves:number|null,
 *   avgMs:number|null, ratio:number, avgRatio:number, skipped:boolean, merged:boolean, pseudo:boolean}} SplitRow */
/** @typedef {{key:string, tone:'good'|'warn'|'info'|'muted', text:string, tag?:string}} CoachLine */
/** Session focus: what the user is training (src/store/focus.js). Every statistic is computed within one focus.
 * @typedef {'speed'|'flow'|'learning'} Focus */
/** One scope of statistics (all time or one session) of ONE focus, as display strings; '—' until an average
 * has enough solves. Speed reads time/averages/pb, flow reads `flow`, learning reads `learning`.
 * `flow.gapCv` is the spread of the gaps between moves as a percentage of their mean (lower is steadier);
 * `flow.pauses` counts gaps longer than 2x a solve's median gap. `learning.reviewAccuracy` is '—' until the
 * solve review (src/analysis) stores `reviewAccuracy` (0..100) on records.
 * @typedef {{solves:string, best:string, worst:string, mean:string, mo3:string, ao5:string, ao12:string, ao50:string, ao100:string,
 *   pb:{mo3:string, ao5:string, ao12:string, ao50:string, ao100:string},
 *   flow:{meanTps:string, tpsStd:string, gapCv:string, pauses:string, pausesPerSolve:string},
 *   learning:{meanMoves:string, medianMoves:string, bestMoves:string, reviewAccuracy:string}}} ScopeStatsVM */
/** The top-level fields (solves .. pb, allTime, session) describe the ACTIVE focus (`focus`); `byFocus` has all
 * three (session = that focus's most recent session); `mixed` is the explicit all-foci view, flagged
 * `mixed: true`: never compare it with a single-focus number.
 * @typedef {{focus:Focus, solves:string, best:string, ao5:string, ao12:string, medianTps:string, medianMoves:string,
 *   worst:string, mo3:string, ao50:string, ao100:string, pb:ScopeStatsVM['pb'],
 *   allTime:ScopeStatsVM, session:ScopeStatsVM,
 *   byFocus:Object<Focus, {allTime:ScopeStatsVM, session:ScopeStatsVM}>, mixed:ScopeStatsVM & {mixed:true}}} StatsVM */
/** @typedef {{key:string, label:string, action:BrainAction['type'], penalty?:'+2'|'DNF'}} KeyHint */
/** Config bar: clicking an option dispatches setSetting(item.id, option.value).
 * @typedef {{items:{id:string, label?:string, options:{value:string, label:string, active:boolean}[]}[]}} ConfigBarVM */
/** @typedef {{open:boolean, sections:{id:string, label:string, rows:{id:string, label:string, help:string,
 *   control:'segmented'|'number', options:{value:string, label:string, active:boolean, isDefault:boolean}[], value?:number}[]}[]}} SettingsPanelVM */

/** caret: 0..1 fraction of InspectionVM.scaleMs (for unlimited inspection, of the current minute lap).
 * @typedef {{startedAtSolve:number|null, clockText:string, currentFill:number, currentSplitText:string,
 *   currentOver:boolean, inspection:{elapsedMs:number, remainingMs:number|null, overtimeMs:number, bigText:string,
 *   tone:string, caret:number, consequence:string}|null}} FrameVM */

/** @typedef {{type:'connect'}|{type:'reconnect'}|{type:'resumeSolve'}|{type:'sync'}|{type:'recenter'}|{type:'disconnect'}|{type:'clearSavedCube'}
 *  |{type:'resetView'}|{type:'rebuildView'}|{type:'start'}|{type:'startCustom'}|{type:'generateScramble'}
 *  |{type:'setScrambleText', text:string}|{type:'cancel'}|{type:'next'}|{type:'retry'}|{type:'dismissResults'}
 *  |{type:'setPenalty', penalty:null|'none'|'+2'|'DNF', at?:number}|{type:'togglePenalty', penalty:'+2'|'DNF'}
 *  |{type:'deleteSolve', at?:number}|{type:'undoDelete'}
 *  |{type:'setSetting', path:string, value:any}|{type:'toggleSettings'}|{type:'toggleDebug'}|{type:'command', text:string}
 *  |{type:'toggleTimer'}|{type:'cycleCoach'}|{type:'export'}|{type:'import', file:File}|{type:'setStyle', style:BrainStyle}
 *  |{type:'sendLog'}|{type:'clearLog'}} BrainAction */

/** A mounted view part. update() receives the new and previous view-model.
 * @typedef {{update:(vm:BrainVM, prev:BrainVM|null)=>void, frame?:(f:FrameVM)=>void, destroy:()=>void}} Component */
/** A style part factory. `aside` is a second host in the right-hand column, passed
 * only when the style declares it in StyleModule.asides.
 * @typedef {(host:HTMLElement, ctx:{dispatch:(a:BrainAction)=>void, aside?:HTMLElement}) => Component} ComponentFactory */
/** A visual style: the parts that differ between Orbit and Mono. The shell
 * (layout, clock, coach, settings, compat ids) is shared.
 * @typedef {{id:BrainStyle, layout:'column'|'orbit', timeline:ComponentFactory, inspection:ComponentFactory,
 *   results:ComponentFactory, asides?:{timeline?:boolean, inspection?:boolean}}} StyleModule */

/* Actions the shell dispatches: setSetting uses the settings row id / config-bar item id as
 * the path (e.g. 'inspection.mode', 'toggles.f2lHint'); #brain-pseudo sends
 * setSetting('f2l', 'pseudo'|'standard'); #brain-inspection sends setSetting('inspection', {enabled})
 * (the legacy shape); the settings <details> toggle sends toggleSettings; {type:'command', text:''}
 * asks for the command line (vm.commandOpen). The controller fills #brain-toggles and
 * #brain-connection-log itself.
 * Chart APIs (src/brain/charts/*, coloured by CSS classes/variables; SVG except the
 * split bars, which are HTML in a CSS grid because they are mostly text):
 *   createTpsLine(host, {variant:'mono'|'orbit'}) -> {update(series:TpsSeries, {drawIn:boolean}), destroy}
 *   createSplitBars(host, {layout:'columns'|'rows'}) -> {update(rows:SplitRow[]), destroy}
 *   createSparkline(host) -> {update(spark), destroy}
 *   createDonut(host) -> {update(donut), destroy}
 * Shell API (src/brain/shell.js):
 *   createShell(root, {dispatch}) -> {slots:{cube, timeline, inspection, results, inspectionAside, timelineAside},
 *     update(vm, prev), frame(f),
 *     setStyle(mod:StyleModule), destroy()}
 *   The cube slot (#brain-cube) is never re-created; the controller mounts the 3D cube once.
 * Theme tokens: CSS custom properties --b-* per :root[data-theme] .brain[data-brain-style]
 *   (values in docs/design/brain-v2/tokens.md). Component CSS uses only --b-* variables, never hex. */
