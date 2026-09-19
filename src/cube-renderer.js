/**
 * A small, dependency-free SVG renderer for the three visible faces of a
 * 3x3 cube.  It is deliberately presentation-only: a trainer can supply a
 * target corner and the two stickers which should be revealed, while the
 * renderer takes care of the perspective, masking and labels.
 *
 * The module works in a browser and in SSR. `renderCube` returns an SVGElement
 * when a DOM is available, and an SVG string otherwise. Pass `{ asMarkup:
 * true }` to always receive the string form.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let renderId = 0;

export const DEFAULT_COLORS = Object.freeze({
  U: '#f5f7fa',
  D: '#f5d34b',
  F: '#36b37e',
  B: '#3478db',
  R: '#f06a5f',
  L: '#f29d49',
  hidden: '#121a2b',
});

// Cell coordinates are [row, column], from the back/top-left of each face as
// it appears in the isometric drawing. Keeping this map public makes it easy
// for a trainer to associate a detection result with a rendered sticker.
export const FACE_CELL_PIECES = Object.freeze({
  U: Object.freeze([
    ['UBL', 'UB', 'UBR'],
    ['UL', 'U', 'UR'],
    ['UFL', 'UF', 'UFR'],
  ]),
  F: Object.freeze([
    ['UFL', 'UF', 'UFR'],
    ['FL', 'F', 'FR'],
    ['DFL', 'DF', 'DFR'],
  ]),
  R: Object.freeze([
    ['UFR', 'UR', 'UBR'],
    ['FR', 'R', 'BR'],
    ['DFR', 'DR', 'DBR'],
  ]),
});

export const VISIBLE_FACES = Object.freeze(['U', 'F', 'R']);

const FACE_NAMES = Object.freeze({ U: 'top', F: 'front', R: 'right' });
const CORNER_FACES = Object.freeze({
  UBL: Object.freeze(['U', 'B', 'L']),
  UBR: Object.freeze(['U', 'B', 'R']),
  UFL: Object.freeze(['U', 'F', 'L']),
  UFR: Object.freeze(['U', 'F', 'R']),
  DBL: Object.freeze(['D', 'B', 'L']),
  DBR: Object.freeze(['D', 'B', 'R']),
  DFL: Object.freeze(['D', 'F', 'L']),
  DFR: Object.freeze(['D', 'F', 'R']),
});

const CORNER_SET = new Set(Object.keys(CORNER_FACES));
const SVG_STYLE = `
  .cube-face { stroke: #080d18; stroke-width: 2; stroke-linejoin: round; }
  .cube-sticker { stroke: #0a1020; stroke-width: 2.5; stroke-linejoin: round; }
  .cube-sticker--hidden { fill: #111a2b; stroke: #596681; stroke-dasharray: 5 4; }
  .cube-sticker--known { stroke: #ffffff; stroke-opacity: .8; stroke-width: 3; }
  .cube-sticker--quiet-target { opacity: .7; }
  .cube-sticker--active-target { stroke: #ffffff; stroke-opacity: .98; stroke-width: 3.5; filter: url(#cube-target-glow); }
  .cube-sticker__highlight { fill: none; stroke: #ffffff; stroke-opacity: .17; stroke-width: 1.5; }
  .cube-sticker__question { fill: #f5f7fa; font: 700 22px/1 system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
  .cube-sticker__question--quiet { fill-opacity: .55; font-size: 18px; }
  .cube-target-marker { fill: #263451; stroke: #8ea1c5; stroke-width: 1.5; }
  .cube-target-marker--active { fill: #ffffff; stroke: #ffffff; }
  .cube-target-marker__text { fill: #f5f7fa; font: 700 9px/1 system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
  .cube-target-marker--active .cube-target-marker__text { fill: #111a2b; }
  .cube-face-label { fill: #ffffff; fill-opacity: .78; font: 700 11px/1 system-ui, sans-serif; letter-spacing: .16em; text-anchor: middle; pointer-events: none; }
  @media (prefers-reduced-motion: no-preference) {
    .cube-face-group { transform-box: fill-box; transform-origin: center; animation: cube-face-enter 420ms cubic-bezier(.2,.8,.2,1) both; }
    .cube-face-group--F { animation-delay: 45ms; }
    .cube-face-group--R { animation-delay: 90ms; }
    @keyframes cube-face-enter { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
  }
`;

/**
 * Return information for a sticker using the renderer's public coordinates.
 * `piece` is a cubie name (for example `UFR` or `UF`), and `kind` is one of
 * `corner`, `edge`, or `center`.
 */
export function getStickerCoordinate(face, row, column) {
  const normalizedFace = String(face || '').toUpperCase();
  const r = Number(row);
  const c = Number(column);
  if (!VISIBLE_FACES.includes(normalizedFace) || !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r > 2 || c < 0 || c > 2) {
    return null;
  }
  const piece = FACE_CELL_PIECES[normalizedFace][r][c];
  const kind = CORNER_SET.has(piece) ? 'corner' : (piece.length === 2 ? 'edge' : 'center');
  return Object.freeze({ face: normalizedFace, row: r, column: c, piece, kind });
}

function normalizeCorner(value) {
  const token = String(value || 'UFR').toUpperCase().replace(/[^UDFBRL]/g, '');
  if (CORNER_FACES[token]) return token;
  const wanted = new Set(token.split(''));
  const found = Object.keys(CORNER_FACES).find((name) => name.split('').every((letter) => wanted.has(letter)) && wanted.size === 3);
  return found || 'UFR';
}

function normalizeFaces(value) {
  if (Array.isArray(value)) return value.map((face) => String(face).toUpperCase()).filter((face) => /^[UDFBRL]$/.test(face));
  if (value && typeof value === 'object') return Object.keys(value).map((face) => String(face).toUpperCase()).filter((face) => /^[UDFBRL]$/.test(face));
  if (typeof value === 'string') return value.toUpperCase().split('').filter((face) => /^[UDFBRL]$/.test(face));
  return [];
}

function normalizeTarget(targetData = {}, fallback = {}) {
  const source = targetData && typeof targetData === 'object' ? targetData : {};
  const orientation = source.orientation && typeof source.orientation === 'object' ? source.orientation : {};
  const orientationFaces = (typeof source.orientation === 'string' || Array.isArray(source.orientation)) ? source.orientation : null;
  const targetCorner = normalizeCorner(source.targetCorner || source.target || source.corner || source.piece || orientation.targetCorner || fallback.targetCorner);
  const targetFaces = CORNER_FACES[targetCorner];
  const orientationStickerMap = Object.keys(orientation).some((face) => /^[UDFBRL]$/i.test(face)) ? orientation : null;
  const knownInput = source.knownStickers || source.known || source.stickers || orientation.knownStickers || orientation.known || orientationStickerMap || fallback.knownInput || {};
  const knownFacesInput = source.knownFaces || source.revealedFaces || orientation.knownFaces || orientation.revealedFaces || orientationFaces || fallback.knownFaces;
  let knownFaces = normalizeFaces(knownFacesInput);
  if (!knownFaces.length && knownInput && typeof knownInput === 'object') knownFaces = normalizeFaces(knownInput);
  if (!knownFaces.length) knownFaces = targetFaces.slice(0, 2);
  knownFaces = targetFaces.filter((face) => knownFaces.includes(face));
  if (knownFaces.length > 2) knownFaces = knownFaces.slice(0, 2);

  const hiddenFace = String(source.hiddenFace || source.unknownFace || orientation.hiddenFace || targetFaces.find((face) => !knownFaces.includes(face)) || targetFaces[2]).toUpperCase();
  const values = knownInput && typeof knownInput === 'object' ? knownInput : {};
  return { targetCorner, targetFaces, knownFaces, hiddenFace, knownInput: values };
}

function normalizeCase(caseData = {}) {
  const source = caseData && typeof caseData === 'object' ? caseData : {};
  const orientation = source.orientation && typeof source.orientation === 'object' ? source.orientation : {};
  const fallback = normalizeTarget(source, {});
  const targetData = Array.isArray(source.targets) && source.targets.length ? source.targets : [source];
  const targets = targetData.map((target) => normalizeTarget(target, fallback));
  const requestedIndex = Number(source.activeTargetIndex);
  const activeTargetIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < targets.length ? requestedIndex : 0;
  return {
    ...targets[activeTargetIndex],
    targets,
    activeTargetIndex,
    colors: source.colors || orientation.colors || {},
    stickerColors: source.stickerColors || orientation.stickerColors || {},
    cornerStickers: source.cornerStickers || orientation.cornerStickers || {},
    showAllCorners: Boolean(source.showAllCorners),
  };
}

function point(x, y) { return [x, y]; }

function geometry(width, height) {
  // The four points of each face are ordered p00, p02, p22, p20. This is the
  // same order used by FACE_CELL_PIECES and makes the coordinate mapping
  // unambiguous even if the visual proportions are changed later.
  const p = (x, y) => point(width * x, height * y);
  return {
    U: [p(.43, .13), p(.83, .13), p(.65, .31), p(.25, .31)],
    F: [p(.25, .31), p(.65, .31), p(.65, .79), p(.25, .79)],
    R: [p(.65, .31), p(.83, .13), p(.83, .61), p(.65, .79)],
  };
}

function lerp(a, b, amount) { return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount]; }

function bilinear(facePoints, u, v) {
  const top = lerp(facePoints[0], facePoints[1], u);
  const bottom = lerp(facePoints[3], facePoints[2], u);
  return lerp(top, bottom, v);
}

function cellQuad(facePoints, row, column, gap = .075) {
  const u0 = column / 3;
  const u1 = (column + 1) / 3;
  const v0 = row / 3;
  const v1 = (row + 1) / 3;
  const raw = [bilinear(facePoints, u0, v0), bilinear(facePoints, u1, v0), bilinear(facePoints, u1, v1), bilinear(facePoints, u0, v1)];
  const center = raw.reduce((sum, item) => [sum[0] + item[0] / 4, sum[1] + item[1] / 4], [0, 0]);
  return raw.map((item) => lerp(item, center, gap));
}

function pointsAttribute(points) { return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '); }
function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function faceColor(face, colors) {
  return colors[face] || DEFAULT_COLORS[face];
}

function stickerColor(face, caseInfo, palette) {
  const supplied = caseInfo.knownInput[face];
  if (supplied && palette[String(supplied).toUpperCase()]) return palette[String(supplied).toUpperCase()];
  if (supplied && typeof supplied === 'string') return supplied;
  return faceColor(face, palette);
}

function regularStickerColor(face, coordinate, caseInfo, palette) {
  const key = `${face}:${coordinate.piece}`;
  const stickers = coordinate.kind === 'corner' ? caseInfo.cornerStickers : caseInfo.stickerColors;
  const supplied = stickers[key] ?? stickers?.[face]?.[coordinate.piece];
  if (supplied && palette[String(supplied).toUpperCase()]) return palette[String(supplied).toUpperCase()];
  if (supplied && typeof supplied === 'string') return supplied;
  return faceColor(face, palette);
}

function centerOf(points) {
  return points.reduce((sum, item) => [sum[0] + item[0] / points.length, sum[1] + item[1] / points.length], [0, 0]);
}

function targetCell(face, targetCorner) {
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (FACE_CELL_PIECES[face][row][column] === targetCorner) return { row, column };
    }
  }
  return null;
}

function targetMarker(face, facePoints, target, index, isActive) {
  // A marker is placed on the first visible face containing this target, so a
  // corner shared by two/three visible faces still receives one marker.
  if (VISIBLE_FACES.find((candidate) => targetCell(candidate, target.targetCorner)) !== face) return '';
  const cell = targetCell(face, target.targetCorner);
  const quad = cellQuad(facePoints, cell.row, cell.column);
  const [x, y] = centerOf(quad);
  const [centerX, centerY] = centerOf(facePoints);
  const dx = x - centerX;
  const dy = y - centerY;
  const length = Math.sqrt((dx * dx) + (dy * dy)) || 1;
  const markerX = x + (dx / length) * 13;
  const markerY = y + (dy / length) * 13;
  const number = String(index + 1).padStart(2, '0');
  const markerClass = `cube-target-marker${isActive ? ' cube-target-marker--active' : ''}`;
  return `<g class="${markerClass}" aria-label="Target ${index + 1}, ${target.targetCorner}" data-target-index="${index}"><circle class="cube-target-marker" cx="${markerX.toFixed(2)}" cy="${markerY.toFixed(2)}" r="10"/><text class="cube-target-marker__text" x="${markerX.toFixed(2)}" y="${markerY.toFixed(2)}">${number}</text></g>`;
}

function renderFace(face, facePoints, caseInfo, palette) {
  const result = [`<g class="cube-face-group cube-face-group--${face}" data-face="${face}" aria-label="${FACE_NAMES[face]} face">`];
  result.push(`<polygon class="cube-face" points="${pointsAttribute(facePoints)}" fill="${escapeXml(faceColor(face, palette))}" aria-hidden="true"/>`);

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const coordinate = getStickerCoordinate(face, row, column);
      const quad = cellQuad(facePoints, row, column);
      const matches = (caseInfo.showAllCorners ? [] : caseInfo.targets).map((target, index) => ({
        target,
        index,
        isKnown: coordinate.piece === target.targetCorner && target.knownFaces.includes(face),
        isUnknown: coordinate.piece === target.targetCorner && !target.knownFaces.includes(face) && face === target.hiddenFace,
      })).filter(({ target, isKnown, isUnknown }) => coordinate.piece === target.targetCorner && (isKnown || isUnknown));
      const activeMatch = matches.find(({ index }) => index === caseInfo.activeTargetIndex);
      const knownMatch = activeMatch?.isKnown ? activeMatch : matches.find(({ isKnown }) => isKnown);
      const unknownMatch = activeMatch?.isUnknown ? activeMatch : matches.find(({ isUnknown }) => isUnknown);
      const isTarget = matches.length > 0;
      const isKnown = Boolean(knownMatch);
      const isUnknownTarget = Boolean(unknownMatch) && !isKnown;
      const isMaskedCorner = coordinate.kind === 'corner' && !caseInfo.showAllCorners && !isKnown && !isUnknownTarget;
      const hidden = isMaskedCorner || isUnknownTarget;
      const isActiveTarget = Boolean(activeMatch);
      const isQuietTarget = isTarget && !isActiveTarget;
      const classes = [
        'cube-sticker',
        hidden ? 'cube-sticker--hidden' : '',
        isKnown ? 'cube-sticker--known' : '',
        isQuietTarget ? 'cube-sticker--quiet-target' : '',
        isActiveTarget ? 'cube-sticker--active-target' : '',
      ].filter(Boolean).join(' ');
      const label = hidden
        ? (isUnknownTarget ? `${FACE_NAMES[face]} ${coordinate.piece} sticker, unknown target ${unknownMatch.index + 1}` : `${FACE_NAMES[face]} corner sticker masked`)
        : (isTarget ? `${FACE_NAMES[face]} ${coordinate.kind} sticker, target ${knownMatch?.index + 1 || matches[0].index + 1}` : `${FACE_NAMES[face]} ${coordinate.kind} sticker`);
      const color = hidden ? DEFAULT_COLORS.hidden : (isKnown ? stickerColor(face, knownMatch.target, palette) : regularStickerColor(face, coordinate, caseInfo, palette));
      const targetIndices = matches.map(({ index }) => index).join(',');
      result.push(`<polygon class="${classes}" points="${pointsAttribute(quad)}" fill="${escapeXml(color)}" data-face="${face}" data-row="${row}" data-column="${column}" data-piece="${coordinate.piece}" data-kind="${coordinate.kind}"${isTarget ? ' data-target="true"' : ''}${isTarget ? ` data-target-indices="${targetIndices}"` : ''}${isActiveTarget ? ' data-active-target="true"' : ''}${hidden ? ' data-masked="true"' : ''} aria-label="${escapeXml(label)}"/>`);

      if (!hidden) {
        // A subtle top-left shine gives the flat SVG a tactile, polished feel.
        const shine = [quad[0], lerp(quad[0], quad[1], .82), lerp(quad[0], quad[3], .18)];
        result.push(`<polygon class="cube-sticker__highlight" points="${pointsAttribute(shine)}" aria-hidden="true"/>`);
      }
      if (isUnknownTarget) {
        const [x, y] = centerOf(quad);
        const questionClass = `cube-sticker__question${isActiveTarget ? '' : ' cube-sticker__question--quiet'}`;
        result.push(`<text class="${questionClass}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" aria-hidden="true">?</text>`);
      }
    }
  }

  if (!caseInfo.showAllCorners) caseInfo.targets.forEach((target, index) => {
    result.push(targetMarker(face, facePoints, target, index, index === caseInfo.activeTargetIndex));
  });
  const labelPoint = centerOf(facePoints);
  result.push(`<text class="cube-face-label" x="${labelPoint[0].toFixed(2)}" y="${(labelPoint[1] + 4).toFixed(2)}" aria-hidden="true">${face}</text>`);
  result.push('</g>');
  return result.join('');
}

/**
 * Produce an SVG string. Useful for SSR, snapshots, or direct innerHTML use.
 * Options: width, height, colors, title, description, and `className`.
 */
export function renderCubeMarkup(caseData = {}, options = {}) {
  const width = Number(options.width) > 0 ? Number(options.width) : 440;
  const height = Number(options.height) > 0 ? Number(options.height) : 400;
  const palette = { ...DEFAULT_COLORS, ...(caseData.colors || {}), ...(options.colors || {}) };
  const caseInfo = normalizeCase(caseData);
  const title = options.title || 'Corner recognition cube';
  const targetSummary = caseInfo.targets.length > 1
    ? `${caseInfo.targets.length} corner targets are shown; target ${caseInfo.activeTargetIndex + 1} is active.`
    : `the ${caseInfo.targetCorner} corner is selected`;
  const description = options.description || (caseInfo.showAllCorners
    ? 'Three-face cube view showing the top, front, and right stickers.'
    : `Three-view cube where ${targetSummary} Known stickers are highlighted and hidden corners are masked.`);
  const uid = `corner-cube-${++renderId}`;
  const className = options.className ? ` class="${escapeXml(options.className)}"` : '';
  const faces = geometry(width, height);
  const faceMarkup = VISIBLE_FACES.map((face) => renderFace(face, faces[face], caseInfo, palette)).join('');
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${uid}-title ${uid}-description"${className}><title id="${uid}-title">${escapeXml(title)}</title><desc id="${uid}-description">${escapeXml(description)}</desc><style>${SVG_STYLE}</style><defs><filter id="cube-target-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="#0b1120" aria-hidden="true"/><g>${faceMarkup}</g></svg>`;
}

/**
 * Render a cube as an SVGElement in the browser, or as markup in non-DOM
 * environments. Set `options.asMarkup` when deterministic string output is
 * preferred. `caseData` accepts `targetCorner` (e.g. `UFR`), `knownFaces`
 * (two face letters), `knownStickers` (face -> color or face letter), and
 * `hiddenFace`. For sequential drills, pass `targets: [{ targetCorner,
 * knownFaces, hiddenFace, knownStickers }, ...]` plus `activeTargetIndex`.
 * Each target receives a small 01/02/03 marker; inactive target stickers are
 * intentionally quieter. `activeTargetIndex` defaults to 0.
 */
export function renderCube(caseData = {}, options = {}) {
  const markup = renderCubeMarkup(caseData, options);
  if (options.asMarkup || typeof document === 'undefined') return markup;
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

export const renderCornerRecognitionCube = renderCube;
export const toSvgMarkup = renderCubeMarkup;

export default Object.freeze({
  DEFAULT_COLORS,
  FACE_CELL_PIECES,
  VISIBLE_FACES,
  getStickerCoordinate,
  renderCube,
  renderCubeMarkup,
  renderCornerRecognitionCube,
  toSvgMarkup,
});
