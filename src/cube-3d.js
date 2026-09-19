import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FACE_NORMALS = {
  U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
  B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
};
const DEFAULT_FACE_COLORS = { U: '#ffffff', D: '#ffd500', F: '#009b48', B: '#0051ba', R: '#e7332a', L: '#ff6b00' };
const FACE_ORDER = ['U', 'D', 'F', 'B', 'R', 'L'];

function pieceAt(x, y, z) {
  let piece = '';
  if (y === 1) piece += 'U';
  if (y === -1) piece += 'D';
  if (z === 1) piece += 'F';
  if (z === -1) piece += 'B';
  if (x === 1) piece += 'R';
  if (x === -1) piece += 'L';
  return piece;
}

function samePiece(a, b) {
  return [...String(a)].sort().join('') === [...String(b)].sort().join('');
}

function cornerPosition(piece) {
  const token = String(piece || '').toUpperCase();
  return [
    token.includes('R') ? 1 : token.includes('L') ? -1 : 0,
    token.includes('U') ? 1 : token.includes('D') ? -1 : 0,
    token.includes('F') ? 1 : token.includes('B') ? -1 : 0,
  ];
}

function makeQuestionTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#242721';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f4f1e8';
  ctx.font = '700 62px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeAnswerBadge() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 176;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.15, .74, 1);
  sprite.renderOrder = 20;
  sprite.visible = false;

  function draw(status, colorName, colorHex) {
    const semantic = status === 'correct' ? '#55d88b' : '#ff625a';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8f7f1';
    context.beginPath();
    context.roundRect(7, 7, 498, 162, 22);
    context.fill();
    context.strokeStyle = semantic;
    context.lineWidth = 12;
    context.stroke();

    context.fillStyle = semantic;
    context.font = '800 38px Manrope, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(status === 'correct' ? '✓' : '×', 34, 88);

    context.fillStyle = colorHex;
    context.beginPath();
    context.arc(112, 88, 37, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,.22)';
    context.lineWidth = 3;
    context.stroke();

    context.fillStyle = '#171815';
    context.font = '700 22px DM Mono, monospace';
    context.fillText(status === 'correct' ? 'CORRECT' : 'CORRECT COLOR', 171, 57);
    context.font = '800 42px Manrope, sans-serif';
    context.fillText(String(colorName).toUpperCase(), 171, 110);
    texture.needsUpdate = true;
    sprite.visible = true;
  }

  return { sprite, texture, draw };
}

function stickerTransform(mesh, face, x, y, z) {
  const offset = 0.506;
  mesh.position.set(x, y, z);
  if (face === 'U') { mesh.position.y += offset; mesh.rotation.x = -Math.PI / 2; }
  if (face === 'D') { mesh.position.y -= offset; mesh.rotation.x = Math.PI / 2; }
  if (face === 'F') mesh.position.z += offset;
  if (face === 'B') { mesh.position.z -= offset; mesh.rotation.y = Math.PI; }
  if (face === 'R') { mesh.position.x += offset; mesh.rotation.y = Math.PI / 2; }
  if (face === 'L') { mesh.position.x -= offset; mesh.rotation.y = -Math.PI / 2; }
}

export function createCube3D(container, options = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  const cornerCameraPosition = new THREE.Vector3(6.7, 5.6, 7.7);
  camera.position.copy(cornerCameraPosition);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional Rubik’s Cube.');
  renderer.domElement.setAttribute('role', 'img');
  container.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.rotateSpeed = .55;
  controls.minPolarAngle = .45;
  controls.maxPolarAngle = Math.PI - .45;
  const tumbleControls = new TrackballControls(camera, renderer.domElement);
  tumbleControls.enabled = false;
  tumbleControls.noZoom = true;
  tumbleControls.noPan = true;
  tumbleControls.rotateSpeed = 1.65;
  tumbleControls.staticMoving = false;
  tumbleControls.dynamicDampingFactor = .14;
  const syncCameraPose = () => {
    renderer.domElement.dataset.cameraPose = camera.position.toArray().map((value) => value.toFixed(4)).join(',');
    renderer.domElement.dataset.cameraUp = camera.up.toArray().map((value) => value.toFixed(4)).join(',');
  };
  controls.addEventListener('change', syncCameraPose);
  tumbleControls.addEventListener('change', syncCameraPose);
  let interactionMode = options.mode || 'corner';
  let fullTouchRotation = false;
  let lockedViewOffset = { id: 'center', label: 'centered', yaw: 0, pitch: 0 };
  let onPieceClick = options.onPieceClick || null;
  let selectablePieces = new Set();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x14170f, 2.3));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
  keyLight.position.set(-4, 8, 7);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xbddc78, 1.5);
  rimLight.position.set(6, -2, -4);
  scene.add(rimLight);

  const cubeGroup = new THREE.Group();
  // Keep the cube aligned to the camera constraints and stationary at onset.
  cubeGroup.rotation.y = 0;
  scene.add(cubeGroup);
  let bottomFace = 'D';
  let frontFace = 'F';
  const selectionMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: .92,
    depthTest: true,
  });
  const selectionCage = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.13, 1.13, 1.13)),
    selectionMaterial,
  );
  selectionCage.visible = false;
  selectionCage.renderOrder = 4;
  cubeGroup.add(selectionCage);
  const scoutCages = [];
  const scoutCageMaterial = selectionMaterial.clone();
  const cubieGeometry = new RoundedBoxGeometry(.96, .96, .96, 3, .08);
  const cubieMaterial = new THREE.MeshStandardMaterial({ color: 0x10120f, roughness: .48, metalness: .02 });
  const stickerGeometry = new RoundedBoxGeometry(.805, .805, .018, 3, .055);
  function frameGeometry(outer, inner) {
    const shape = new THREE.Shape();
    shape.moveTo(-outer, -outer); shape.lineTo(outer, -outer);
    shape.lineTo(outer, outer); shape.lineTo(-outer, outer); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner); hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner); hole.lineTo(inner, -inner); hole.closePath();
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape);
  }
  const outerFrameGeometry = frameGeometry(.461, .402);
  const innerFrameGeometry = frameGeometry(.446, .417);
  const frameBackingMaterial = new THREE.MeshBasicMaterial({ color: '#080a08', toneMapped: false });
  const questionTexture = makeQuestionTexture();
  const answerBadge = makeAnswerBadge();
  cubeGroup.add(answerBadge.sprite);
  const stickerMeshes = [];
  const pickMeshes = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const cubie = new THREE.Mesh(cubieGeometry, cubieMaterial);
        cubie.position.set(x, y, z);
        cubie.userData.cubiePosition = [x, y, z];
        cubeGroup.add(cubie);
        pickMeshes.push(cubie);
        const piece = pieceAt(x, y, z);
        if (piece.length > 1) {
          const cage = new THREE.LineSegments(selectionCage.geometry, scoutCageMaterial);
          cage.position.set(x, y, z);
          cage.userData = { piece, cubiePosition: [x, y, z] };
          cage.visible = false;
          cage.renderOrder = 4;
          cubeGroup.add(cage);
          scoutCages.push(cage);
        }
        for (const face of FACE_ORDER) {
          const [nx, ny, nz] = FACE_NORMALS[face];
          if ((nx && x !== nx) || (ny && y !== ny) || (nz && z !== nz)) continue;
          // Recognition colors must not drift with lighting: unlit materials
          // keep white, yellow, and orange visually distinct at every angle.
          const material = new THREE.MeshBasicMaterial({ color: DEFAULT_FACE_COLORS[face], toneMapped: false });
          const sticker = new THREE.Mesh(stickerGeometry, material);
          stickerTransform(sticker, face, x, y, z);
          sticker.userData = { face, piece, cubiePosition: [x, y, z], kind: piece.length === 3 ? 'corner' : piece.length === 2 ? 'edge' : 'center' };
          cubeGroup.add(sticker);
          stickerMeshes.push(sticker);
          pickMeshes.push(sticker);
          const border = new THREE.Group();
          const backing = new THREE.Mesh(outerFrameGeometry, frameBackingMaterial);
          const ink = new THREE.Mesh(innerFrameGeometry, new THREE.MeshBasicMaterial({ color: '#65e8ff', toneMapped: false }));
          backing.position.z = .025;
          ink.position.z = .028;
          border.add(backing, ink);
          border.visible = false;
          sticker.add(border);
          sticker.userData.border = border;
          sticker.userData.borderInk = ink;
        }
      }
    }
  }

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    tumbleControls.handleResize();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerStart = null;
  renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerStart = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });
  renderer.domElement.addEventListener('pointerup', (event) => {
    const start = pointerStart;
    pointerStart = null;
    if (interactionMode !== 'f2l' || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Never look through a center, solved piece or black cubie to a hidden face.
    scene.updateMatrixWorld(true);
    const hit = raycaster.intersectObjects(pickMeshes, false)[0];
    if (hit && selectablePieces.has(hit.object.userData.piece)) {
      onPieceClick?.({ piece: hit.object.userData.piece, kind: hit.object.userData.kind, face: hit.object.userData.face });
    }
  });

  function setMode(mode) {
    interactionMode = mode;
    renderer.domElement.dataset.interactionMode = mode;
    controls.enabled = false;
    tumbleControls.enabled = false;
    if (mode === 'f2l') {
      renderer.domElement.dataset.rotation = 'limited-horizontal';
      renderer.domElement.dataset.azimuthLimit = '0.62';
      camera.position.set(0, 5.4, 8.8);
      controls.target.set(0, 0, 0);
      controls.enabled = true;
      controls.minAzimuthAngle = -.62;
      controls.maxAzimuthAngle = .62;
      controls.minPolarAngle = .99;
      controls.maxPolarAngle = .99;
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.setAttribute('aria-label', 'Interactive F2L cube. Drag left and right within the limited inspection arc, then click visible corner and edge pieces to match them.');
    } else if (mode === 'scout') {
      renderer.domElement.dataset.rotation = 'free-tumble';
      delete renderer.domElement.dataset.azimuthLimit;
      camera.up.set(0, 1, 0);
      camera.position.set(6.7, 5.6, 7.7);
      tumbleControls.target.set(0, 0, 0);
      tumbleControls.enabled = true;
      tumbleControls.reset();
      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.setAttribute('aria-label', 'Interactive Cross Scout cube. Drag in any direction to tumble through every face and follow highlighted pieces.');
    } else {
      renderer.domElement.dataset.rotation = 'locked';
      delete renderer.domElement.dataset.azimuthLimit;
      camera.position.copy(cornerCameraPosition);
      controls.target.set(0, 0, 0);
      controls.enabled = false;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      renderer.domElement.style.cursor = 'default';
      renderer.domElement.setAttribute('aria-label', 'Three-dimensional corner-recognition cube in a fixed solve view. Hidden corner stickers remain masked.');
      applyLockedViewOffset();
    }
    // OrbitControls writes `touch-action: none` inline. Normal mode keeps
    // vertical page scrolling available; Scout can explicitly capture every
    // direction when the user selects full touch rotation.
    renderer.domElement.style.touchAction = mode === 'scout' && fullTouchRotation ? 'none' : 'pan-y';
    renderer.domElement.dataset.touchMode = mode === 'scout' && fullTouchRotation ? 'full-rotation' : 'page-scroll';
    if (mode === 'scout') tumbleControls.update();
    else controls.update();
    syncCameraPose();
  }
  setMode(interactionMode);

  function applyLockedViewOffset() {
    if (interactionMode !== 'corner') return;
    const spherical=new THREE.Spherical().setFromVector3(cornerCameraPosition);
    spherical.theta+=THREE.MathUtils.degToRad(lockedViewOffset.yaw);
    spherical.phi+=THREE.MathUtils.degToRad(lockedViewOffset.pitch);
    camera.position.setFromSpherical(spherical);
    camera.lookAt(controls.target);
    renderer.domElement.dataset.viewPose=lockedViewOffset.id;
    renderer.domElement.dataset.viewYaw=String(lockedViewOffset.yaw);
    renderer.domElement.dataset.viewPitch=String(lockedViewOffset.pitch);
  }

  function setViewOffset(value={}) {
    const yaw=THREE.MathUtils.clamp(Number(value.yaw)||0,-10,10);
    const pitch=THREE.MathUtils.clamp(Number(value.pitch)||0,-6,6);
    lockedViewOffset={id:String(value.id||'custom'),label:String(value.label||'varied'),yaw,pitch};
    applyLockedViewOffset();
    if (interactionMode === 'scout') tumbleControls.update();
    else controls.update();
    syncCameraPose();
    renderer.render(scene,camera);
  }

  function setFullTouchRotation(enabled) {
    fullTouchRotation = Boolean(enabled);
    renderer.domElement.style.touchAction = interactionMode === 'scout' && fullTouchRotation ? 'none' : 'pan-y';
    renderer.domElement.dataset.touchMode = interactionMode === 'scout' && fullTouchRotation ? 'full-rotation' : 'page-scroll';
  }

  function setOrientation(nextBottom='D',nextFront='F') {
    const bottom=String(nextBottom).toUpperCase(),front=String(nextFront).toUpperCase();
    if (!FACE_NORMALS[bottom] || !FACE_NORMALS[front]) throw new Error('Unknown cube orientation face.');
    const bottomVector=new THREE.Vector3(...FACE_NORMALS[bottom]);
    const frontVector=new THREE.Vector3(...FACE_NORMALS[front]);
    if (Math.abs(bottomVector.dot(frontVector))>.001) throw new Error('The front face must be adjacent to the bottom face.');
    const sourceUp=bottomVector.clone().negate();
    const sourceRight=new THREE.Vector3().crossVectors(sourceUp,frontVector);
    const sourceBasis=new THREE.Matrix4().makeBasis(sourceRight,sourceUp,frontVector);
    cubeGroup.quaternion.setFromRotationMatrix(sourceBasis.invert());
    bottomFace=bottom;frontFace=front;
    renderer.domElement.dataset.bottomFace=bottomFace;
    renderer.domElement.dataset.frontFace=frontFace;
    if (interactionMode === 'scout') tumbleControls.update();
    else controls.update();
    renderer.render(scene,camera);
  }
  setOrientation();

  let stopped = false;
  let feedbackActive = false;
  let animationFrame;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new THREE.Clock();
  let moveAnimation = null;
  let applyingAnimationUpdate = false;
  function cancelMoveAnimation() {
    if (!moveAnimation) return;
    const current = moveAnimation;
    moveAnimation = null;
    current.cancel();
  }
  function frame() {
    if (stopped) return;
    animationFrame = requestAnimationFrame(frame);
    if (document.hidden || !container.clientWidth || !container.clientHeight) return;
    if (interactionMode === 'scout') tumbleControls.update();
    else controls.update();
    if (selectionCage.visible) {
      const pulse = reducedMotion.matches ? .5 : (Math.sin(clock.getElapsedTime() * 2.8) + 1) / 2;
      selectionMaterial.opacity = (feedbackActive ? .52 : .68) + pulse * (feedbackActive ? .48 : .27);
      selectionCage.scale.setScalar(1 + pulse * (feedbackActive ? .055 : .025));
    }
    if (interactionMode === 'scout') {
      const pulse = reducedMotion.matches ? .5 : (Math.sin(clock.getElapsedTime() * 2.8) + 1) / 2;
      scoutCageMaterial.opacity = .68 + pulse * .27;
      if (!moveAnimation) scoutCages.forEach(cage => cage.scale.setScalar(1 + pulse * .025));
    }
    renderer.render(scene, camera);
  }
  frame();

  function update(data) {
    if (!applyingAnimationUpdate) cancelMoveAnimation();
    const palette = { ...DEFAULT_FACE_COLORS, ...(data.colors || {}) };
    const targets = data.targets || [{
      targetCorner: data.targetCorner,
      knownFaces: data.knownFaces,
      hiddenFace: data.hiddenFace,
      knownStickers: data.knownStickers,
    }];
    const activeIndex = data.activeTargetIndex ?? 0;
    const activeCorner = targets[activeIndex]?.targetCorner;
    const feedback = data.feedback || null;
    const f2lFeedback = data.f2lFeedback || null;
    const matchedPieces = new Set(data.matchedPieces || []);
    const showAllCorners = Boolean(data.showAllCorners);
    const highlightedPieces = new Set(data.highlightedPieces || []);
    onPieceClick = data.onPieceClick || onPieceClick;
    selectablePieces = new Set(data.selectablePieces || []);
    if (data.mode && data.mode !== interactionMode) setMode(data.mode);
    scoutCages.forEach(cage => {
      cage.visible = interactionMode === 'scout' && [...highlightedPieces].some(piece => samePiece(piece, cage.userData.piece));
    });
    renderer.domElement.dataset.highlightCages = String(scoutCages.filter(cage => cage.visible).length);
    renderer.domElement.dataset.cornerPresentation = showAllCorners ? 'full' : 'isolated';
    feedbackActive = Boolean(feedback || f2lFeedback);
    const f2lSelected = data.f2lSelection?.[0];
    const f2lHighlighted = f2lFeedback?.piece || f2lSelected;
    if (interactionMode === 'f2l' && f2lHighlighted) {
      selectionCage.position.set(...cornerPosition(f2lHighlighted));
      selectionCage.visible = true;
      selectionMaterial.color.set(f2lFeedback ? (f2lFeedback.status === 'correct' ? '#c6ef47' : '#ff625a') : '#ffffff');
      answerBadge.sprite.visible = false;
    } else if (activeCorner) {
      const position = cornerPosition(activeCorner);
      selectionCage.position.set(...position);
      selectionCage.visible = true;
      selectionMaterial.color.set(feedback ? (feedback.status === 'correct' ? '#55d88b' : '#ff625a') : '#ffffff');
      if (feedback) {
        answerBadge.draw(feedback.status, feedback.correctName, feedback.correctColor);
        answerBadge.sprite.position.set(
          position[0] * 1.35,
          position[1] * 1.34 + (position[1] > 0 ? .68 : .08),
          position[2] * 1.35,
        );
      } else {
        answerBadge.sprite.visible = false;
      }
    } else {
      selectionCage.visible = false;
      answerBadge.sprite.visible = false;
    }

    stickerMeshes.forEach((sticker) => {
      const { face, piece, kind } = sticker.userData;
      const targetIndex = kind === 'corner' ? targets.findIndex((target) => samePiece(target.targetCorner, piece)) : -1;
      const target = targets[targetIndex];
      const isKnown = target && target.knownFaces.includes(face);
      const isHiddenTarget = target && target.hiddenFace === face;
      const active = targetIndex === activeIndex;
      let color = palette[face];
      if (kind === 'edge') color = data.stickerColors?.[`${face}:${piece}`] || color;
      if (kind === 'corner') {
        if (interactionMode === 'f2l') color = data.cornerStickers?.[`${face}:${piece}`] || color;
        else if (interactionMode === 'scout') color = data.cornerStickers?.[`${face}:${piece}`] || color;
        else if (target) color = isKnown ? target.knownStickers[face] : '#242721';
        else color = showAllCorners ? (data.cornerStickers?.[`${face}:${piece}`] || color) : '#242721';
      }
      const revealAnswer = Boolean(feedback && active && isHiddenTarget);
      const nextMap = isHiddenTarget && active && !feedback ? questionTexture : null;
      if (sticker.material.map !== nextMap) {
        sticker.material.map = nextMap;
        sticker.material.needsUpdate = true;
      }
      sticker.material.color.set(revealAnswer ? feedback.correctColor : (isHiddenTarget && active ? '#ffffff' : color));
      const dimmedTarget = Boolean(target && !active && !showAllCorners);
      const matched = interactionMode === 'f2l' && matchedPieces.has(piece);
      sticker.material.transparent = dimmedTarget || matched;
      sticker.material.opacity = dimmedTarget ? .2 : matched ? .38 : 1;
      sticker.material.depthWrite = !(dimmedTarget || matched);
      const f2lEmphasis = interactionMode === 'f2l' && (piece === f2lSelected || piece === f2lFeedback?.piece);
      const correction = interactionMode === 'f2l' && f2lFeedback?.correctPieces?.includes(piece);
      const scoutHighlight = interactionMode === 'scout' && [...highlightedPieces].some((candidate) => samePiece(candidate, piece));
      sticker.userData.border.visible = interactionMode === 'f2l' ? Boolean(f2lEmphasis || correction) : interactionMode === 'scout' ? scoutHighlight : Boolean(active && (isKnown || isHiddenTarget));
      sticker.userData.borderInk.material.color.set(scoutHighlight ? '#65e8ff' : correction ? '#55d88b'
        : f2lFeedback && piece === f2lFeedback.piece ? (f2lFeedback.status === 'correct' ? '#55d88b' : '#ff625a')
        : feedback && active ? (feedback.status === 'correct' ? '#55d88b' : '#ff625a') : '#65e8ff');
      sticker.scale.setScalar(interactionMode === 'scout' && scoutHighlight ? 1.045 : active && (isKnown || isHiddenTarget) ? 1.045 : f2lEmphasis ? 1.055 : 1);
      sticker.renderOrder = active ? 2 : 0;
    });
    renderer.domElement.setAttribute('aria-label', interactionMode === 'f2l'
      ? `Interactive F2L cube with a limited left-right inspection arc.${f2lSelected ? ` Selected ${f2lSelected}.` : ''}${f2lFeedback ? ` Pair result: ${f2lFeedback.status}.` : ''}`
      : interactionMode === 'scout'
        ? `Interactive Cross Scout cube showing all stickers. ${bottomFace} is held on the bottom and ${frontFace} in front.${highlightedPieces.size ? ` Highlighted pieces: ${[...highlightedPieces].join(', ')}.` : ''}`
      : `Three-dimensional corner-recognition cube in a locked ${lockedViewOffset.label} solve view. Current target: ${targets[activeIndex]?.targetCorner || 'corner'}. Hidden stickers remain masked.${feedback ? ` Result: ${feedback.status}. Correct color: ${feedback.correctName}.` : ''}`);
    // Present the new case immediately rather than waiting for the next loop.
    renderer.render(scene, camera);
  }

  // Animate a layer turn for scout playback. The caller supplies the state
  // that should be displayed after the move; geometry is always restored
  // before applying it so repeated updates cannot accumulate transforms.
  function animateMove(move, nextData) {
    cancelMoveAnimation();
    const notation = String(move || '').trim().toUpperCase();
    const face = notation[0];
    if (!FACE_NORMALS[face]) {
      if (nextData) update(nextData);
      return Promise.resolve();
    }
    const turns = notation.includes('2') ? 2 : 1;
    const direction = notation.includes("'") ? -1 : 1;
    const axis = new THREE.Vector3(...FACE_NORMALS[face]);
    const angle = -direction * turns * Math.PI / 2;
    const layer = new THREE.Group();
    cubeGroup.add(layer);
    const members = cubeGroup.children.filter((child) => {
      const position = child.userData.cubiePosition;
      return position && position[axis.x ? 0 : axis.y ? 1 : 2] === (axis.x || axis.y || axis.z);
    });
    const snapshots = members.map((object) => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
    members.forEach((object) => layer.attach(object));
    controls.enabled = false;
    tumbleControls.enabled = false;
    let settled = false;
    let started = performance.now();
    let frameId;
    const restore = () => {
      snapshots.forEach(({ object, position, quaternion, scale }) => {
        cubeGroup.attach(object);
        object.position.copy(position); object.quaternion.copy(quaternion); object.scale.copy(scale);
      });
      cubeGroup.remove(layer);
      controls.enabled = interactionMode === 'f2l';
      tumbleControls.enabled = interactionMode === 'scout';
    };
    return new Promise((resolve) => {
      const finish = (applyState) => {
        if (settled) return;
        settled = true;
        cancelAnimationFrame(frameId);
        restore();
        moveAnimation = null;
        if (applyState && nextData) {
          applyingAnimationUpdate = true;
          update(nextData);
          applyingAnimationUpdate = false;
        }
        resolve();
      };
      moveAnimation = { cancel: () => finish(false) };
      const duration = reducedMotion.matches ? 0 : 260;
      const tick = (now) => {
        if (settled) return;
        const progress = duration ? Math.min((now - started) / duration, 1) : 1;
        layer.rotation.set(0, 0, 0);
        layer.rotateOnAxis(axis, angle * (progress < 1 ? 1 - Math.pow(1 - progress, 3) : 1));
        renderer.render(scene, camera);
        if (progress >= 1) finish(true);
        else frameId = requestAnimationFrame(tick);
      };
      frameId = requestAnimationFrame(tick);
    });
  }

  return {
    update,
    animateMove,
    setMode,
    setViewOffset,
    setOrientation,
    setFullTouchRotation,
    resetView() { setMode(interactionMode); },
    destroy() {
      cancelMoveAnimation();
      stopped = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      tumbleControls.dispose();
      renderer.dispose();
      questionTexture.dispose();
      answerBadge.texture.dispose();
      cubieGeometry.dispose(); cubieMaterial.dispose(); stickerGeometry.dispose();
      outerFrameGeometry.dispose(); innerFrameGeometry.dispose(); frameBackingMaterial.dispose();
      stickerMeshes.forEach((sticker) => { sticker.material.dispose(); sticker.userData.borderInk.material.dispose(); });
      selectionCage.geometry.dispose(); selectionMaterial.dispose(); answerBadge.sprite.material.dispose();
      scoutCageMaterial.dispose();
      container.replaceChildren();
    },
  };
}
