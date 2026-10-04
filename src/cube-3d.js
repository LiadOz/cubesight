import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isMove, toPhysicalTurn } from './moves/notation.js';
import { convexHull } from './ui/cube/bounds.js';

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
    context.fillText(status === 'correct' ? 'correct' : 'correct color', 171, 57);
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
  let turnHint = null;
  function setTurnHint(move) {
    if (turnHint) {
      cubeGroup.remove(turnHint);
      turnHint.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
      turnHint = null;
    }
    delete renderer.domElement.dataset.hintMove;
    delete renderer.domElement.dataset.hintLayers;
    if (!move || !FACE_NORMALS[move[0]]) return;
    const normal = new THREE.Vector3(...FACE_NORMALS[move[0]]);
    const first = Math.abs(normal.y) > .5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const second = new THREE.Vector3().crossVectors(normal, first).normalize();
    const wide = move[1] === 'w';
    const sweep = (move.endsWith("'") ? 1 : -1) * (move.endsWith('2') ? Math.PI : Math.PI * 1.45);
    const group = new THREE.Group();
    const center = normal.clone().multiplyScalar(1.61);
    const drawArc = (radius) => {
      const points = Array.from({ length: 33 }, (_, index) => {
        const angle = -.68 + sweep * index / 32;
        return center.clone().addScaledVector(first, radius * Math.cos(angle)).addScaledVector(second, radius * Math.sin(angle));
      });
      const arc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, .026, 5, false), new THREE.MeshBasicMaterial({ color: 0x13d5ec, depthTest: true, depthWrite: false }));
      arc.renderOrder = 30;
      group.add(arc);
      const tangent = points.at(-1).clone().sub(points.at(-2)).normalize();
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(.095, .22, 10), arc.material.clone());
      arrow.position.copy(points.at(-1));
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      arrow.renderOrder = 31;
      group.add(arrow);
    };
    drawArc(wide ? .72 : .83);
    if (wide) drawArc(.51);
    cubeGroup.add(group);
    turnHint = group;
    renderer.domElement.dataset.hintMove = move;
    renderer.domElement.dataset.hintLayers = wide ? '2' : '1';
  }
  let bottomFace = 'D';
  let frontFace = 'F';
  const heldOrientation = new THREE.Quaternion();
  const targetGyroOrientation = new THREE.Quaternion();
  const gyroAxisMap = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(1, 0, 0),  // GAN +X is red / renderer +X.
    new THREE.Vector3(0, 0, -1), // GAN +Y is blue / renderer -Z.
    new THREE.Vector3(0, 1, 0),  // GAN +Z is white / renderer +Y.
  ));
  const inverseGyroAxisMap = gyroAxisMap.clone().invert();
  let gyroReference = null;
  let latestGyro = null;
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
      // TrackballControls.reset() restores the pose but leaves its damping
      // velocity alive, which otherwise rotates the camera again next frame.
      tumbleControls._lastAngle = 0;
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
    heldOrientation.copy(cubeGroup.quaternion);
    targetGyroOrientation.copy(heldOrientation);
    if (latestGyro) {
      gyroReference = latestGyro.clone();
      renderer.domElement.dataset.gyroTarget = targetGyroOrientation.toArray().map(number => number.toFixed(4)).join(',');
    }
    bottomFace=bottom;frontFace=front;
    renderer.domElement.dataset.bottomFace=bottomFace;
    renderer.domElement.dataset.frontFace=frontFace;
    if (interactionMode === 'scout') tumbleControls.update();
    else controls.update();
  }
  setOrientation();

  function setGyroOrientation(value) {
    if (!value) {
      latestGyro = null;
      gyroReference = null;
      targetGyroOrientation.copy(heldOrientation);
      cubeGroup.quaternion.copy(heldOrientation);
      renderer.domElement.dataset.gyroFollow = 'off';
      delete renderer.domElement.dataset.gyroTarget;
      delete renderer.domElement.dataset.gyroPose;
      return;
    }
    const incoming = new THREE.Quaternion(value.x, value.y, value.z, value.w).normalize();
    latestGyro = incoming;
    if (!gyroReference) gyroReference = incoming.clone();
    // GAN reports orientation in red/blue/white axes. Convert the relative
    // physical rotation into this renderer's red/white/green axes, then apply
    // it around the currently selected held view.
    const delta = gyroReference.clone().invert().multiply(incoming);
    targetGyroOrientation.copy(heldOrientation).multiply(gyroAxisMap).multiply(delta).multiply(inverseGyroAxisMap).normalize();
    renderer.domElement.dataset.gyroFollow = 'on';
    renderer.domElement.dataset.gyroTarget = targetGyroOrientation.toArray().map(number => number.toFixed(4)).join(',');
  }

  function recenterGyro() {
    if (!latestGyro) return;
    gyroReference = latestGyro.clone();
    targetGyroOrientation.copy(heldOrientation);
    cubeGroup.quaternion.copy(heldOrientation);
    renderer.domElement.dataset.gyroTarget = targetGyroOrientation.toArray().map(number => number.toFixed(4)).join(',');
  }

  // Which canonical faces are currently on the bottom / in front of the live
  // (gyro-followed or hand-rotated) cube. Used by Brain to auto-detect the
  // cross from the face the solver chose to put on the bottom at their first
  // solving move. Best-effort: the face whose local normal, after the cube
  // group rotation, points most toward world -Y is on the bottom.
  const worldDown = new THREE.Vector3(0, -1, 0);
  const worldFront = new THREE.Vector3(0, 0, 1);
  function getHeldFaces() {
    let best = bottomFace, bestDot = -2;
    for (const [face, normal] of Object.entries(FACE_NORMALS)) {
      const v = new THREE.Vector3(...normal).applyQuaternion(cubeGroup.quaternion);
      const d = v.dot(worldDown);
      if (d > bestDot) { bestDot = d; best = face; }
    }
    const opposite = { U: 'D', D: 'U', F: 'B', B: 'F', R: 'L', L: 'R' }[best];
    let frontBest = frontFace, frontDot = -2;
    for (const [face, normal] of Object.entries(FACE_NORMALS)) {
      if (face === best || face === opposite) continue;
      const v = new THREE.Vector3(...normal).applyQuaternion(cubeGroup.quaternion);
      const d = v.dot(worldFront);
      if (d > frontDot) { frontDot = d; frontBest = face; }
    }
    return { bottom: best, front: frontBest };
  }

  let stopped = false;
  let feedbackActive = false;
  let animationFrame;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new THREE.Clock();
  let moveAnimation = null;
  // the move cue (see 'Move cue' below); declared before the first frame() runs
  let cueWanted = null;   // { id, move, held, loop, pose }
  let cueLive = null;     // { key, spec, axis, peak, double, members, outline, startedAt, angle }
  let cueSequence = 0;
  let liveMoveQueue = [];
  let liveMoveRunning = false;
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
    moveAnimation?.tick(performance.now());
    if (document.hidden || !container.clientWidth || !container.clientHeight) return;
    if (interactionMode === 'scout') tumbleControls.update();
    else controls.update();
    if (gyroReference) cubeGroup.quaternion.slerp(targetGyroOrientation, reducedMotion.matches ? 1 : .38);
    if (gyroReference) renderer.domElement.dataset.gyroPose = cubeGroup.quaternion.toArray().map(number => number.toFixed(4)).join(',');
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
    tickCue(performance.now());
    renderer.render(scene, camera);
  }
  frame();

  function update(data) {
    if (!applyingAnimationUpdate) { liveMoveQueue = []; cancelMoveAnimation(); }
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
    const dimOthers = Boolean(data.dimOthers);
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

    let dimmedStickerCount = 0, highlightedStickerCount = 0;
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
      const scoutHighlight = interactionMode === 'scout' && [...highlightedPieces].some((candidate) => samePiece(candidate, piece));
      const dimmed = interactionMode === 'scout' && dimOthers && !scoutHighlight;
      if (dimmed) dimmedStickerCount++;
      if (scoutHighlight) highlightedStickerCount++;
      sticker.material.transparent = dimmedTarget || matched || dimmed;
      sticker.material.opacity = dimmedTarget ? .2 : matched ? .38 : dimmed ? .16 : 1;
      sticker.material.depthWrite = !(dimmedTarget || matched || dimmed);
      const f2lEmphasis = interactionMode === 'f2l' && (piece === f2lSelected || piece === f2lFeedback?.piece);
      const correction = interactionMode === 'f2l' && f2lFeedback?.correctPieces?.includes(piece);
      sticker.userData.border.visible = interactionMode === 'f2l' ? Boolean(f2lEmphasis || correction) : interactionMode === 'scout' ? scoutHighlight : Boolean(active && (isKnown || isHiddenTarget));
      sticker.userData.borderInk.material.color.set(scoutHighlight ? '#65e8ff' : correction ? '#55d88b'
        : f2lFeedback && piece === f2lFeedback.piece ? (f2lFeedback.status === 'correct' ? '#55d88b' : '#ff625a')
        : feedback && active ? (feedback.status === 'correct' ? '#55d88b' : '#ff625a') : '#65e8ff');
      sticker.scale.setScalar(interactionMode === 'scout' && scoutHighlight ? 1.045 : active && (isKnown || isHiddenTarget) ? 1.045 : f2lEmphasis ? 1.055 : 1);
      sticker.renderOrder = active ? 2 : 0;
    });
    renderer.domElement.dataset.dimmedStickers = String(dimmedStickerCount);
    renderer.domElement.dataset.highlightedStickers = String(highlightedStickerCount);
    renderer.domElement.setAttribute('aria-label', interactionMode === 'f2l'
      ? `Interactive F2L cube with a limited left-right inspection arc.${f2lSelected ? ` Selected ${f2lSelected}.` : ''}${f2lFeedback ? ` Pair result: ${f2lFeedback.status}.` : ''}`
      : interactionMode === 'scout'
        ? `Interactive Cross Scout cube showing all stickers. ${bottomFace} is held on the bottom and ${frontFace} in front.${highlightedPieces.size ? ` Highlighted pieces: ${[...highlightedPieces].join(', ')}.` : ''}`
      : `Three-dimensional corner-recognition cube in a locked ${lockedViewOffset.label} solve view. Current target: ${targets[activeIndex]?.targetCorner || 'corner'}. Hidden stickers remain masked.${feedback ? ` Result: ${feedback.status}. Correct color: ${feedback.correctName}.` : ''}`);
    // The persistent frame pump paints the latest state once on its next frame.
    // BLE snapshots and replay updates can arrive together; rendering here too
    // would duplicate the frame pump's WebGL work.
  }

  // Animate a layer turn for scout playback. The caller supplies the state
  // that should be displayed after the move; geometry is always restored
  // before applying it so repeated updates cannot accumulate transforms.
  // Any move in notation (faces, wide, slices, whole-cube rotations) turns the
  // matching cubies about the physical axis. A rotation turns every cubie and
  // snaps back at the end: the cube's real orientation belongs to the gyro.
  const cubieMembers = spec => cubeGroup.children.filter((child) => {
    const position = child.userData.cubiePosition;
    return position && spec.layers.includes(position[0] * spec.axis[0] + position[1] * spec.axis[1] + position[2] * spec.axis[2]);
  });
  function animateMove(move, nextData, durationMs=260) {
    teardownCue();   // a real turn owns the layers: the cue steps aside until it is done
    cancelMoveAnimation();
    const notation = String(move || '').trim();
    if (!isMove(notation)) {
      if (nextData) update(nextData);
      return Promise.resolve();
    }
    const spec = toPhysicalTurn(notation);
    const axis = new THREE.Vector3(...spec.axis);
    const angle = spec.angle * Math.PI / 180;
    renderer.domElement.dataset.turningFace = spec.kind === 'face' || spec.kind === 'wide' ? notation[0].toUpperCase() : notation[0];
    const layer = new THREE.Group();
    cubeGroup.add(layer);
    const members = cubieMembers(spec);
    const snapshots = members.map((object) => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone() }));
    members.forEach((object) => layer.attach(object));
    controls.enabled = false;
    tumbleControls.enabled = false;
    let settled = false;
    let started = performance.now();
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
        restore();
        delete renderer.domElement.dataset.turningFace;
        moveAnimation = null;
        if (applyState && nextData) {
          applyingAnimationUpdate = true;
          update(nextData);
          applyingAnimationUpdate = false;
        }
        resolve();
      };
      moveAnimation = { cancel: () => finish(false), tick: null };
      const duration = reducedMotion.matches ? 0 : durationMs;
      const tick = (now) => {
        if (settled) return;
        const progress = duration ? Math.min((now - started) / duration, 1) : 1;
        layer.rotation.set(0, 0, 0);
        // Smooth acceleration and deceleration makes instructional turns
        // readable at slow speeds without a sudden first-frame jump.
        const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
        layer.rotateOnAxis(axis, angle * eased);
        if (progress >= 1) finish(true);
      };
      moveAnimation.tick = tick;
    });
  }

  // Smart-cube packets can arrive faster than a teaching animation. Keep
  // turns in order, then shorten animations under load. If we fall far behind
  // (including in a hidden tab), catch up to the verified latest state.
  // `speed` > 1 (a fast replay) shortens the turns so they keep up.
  function queueLiveMove(move, nextData, { speed = 1 } = {}) {
    teardownCue();
    if (liveMoveQueue.length >= 6 || document.hidden) {
      update(nextData);
      return;
    }
    liveMoveQueue.push({ move, nextData, scale: 1 / Math.sqrt(Math.max(1, speed)) });
    if (liveMoveRunning) return;
    liveMoveRunning = true;
    void (async () => {
      try {
        while (liveMoveQueue.length && !stopped) {
          const next = liveMoveQueue.shift();
          await animateMove(next.move, next.nextData, (liveMoveQueue.length > 2 ? 65 : 105) * next.scale);
        }
      } finally { liveMoveRunning = false; }
    })();
  }

  // --- Move cue -----------------------------------------------------------------------
  // setCue(move, { loop, held, pose }) makes the ACTUAL layer the move turns lean into
  // the turn: it eases out to a partial turn (about 36 degrees, further and twice for a
  // double), holds, eases back to rest, pauses and loops. `move` is written for the hold
  // in `held`; without `held` the cue follows what getHeldFaces reports each frame, so the
  // gyro re-orients it. The cue never fights a real turn: while animateMove or the live
  // queue runs, the layer is put back at rest at once; the cue starts over (after a short
  // beat) when the cube is idle again. `pose` (0..1) freezes the cue at that fraction of
  // its peak (screenshots); reduced motion / loop:false freeze it at a small offset.
  const CUE_PEAK = { quarter: 36, double: 60, rot: 30, rotDouble: 50 };
  const CUE_START_DELAY_MS = 350;
  const CUE_STILL_POSE = .45;
  const smooth = t => { const x = Math.min(Math.max(t, 0), 1); return x * x * (3 - 2 * x); };
  // One pulse: ease out, hold, ease back (fractions of the period), starting at `at`.
  const pulse = (phase, at, out, hold, back) => {
    const t = phase - at;
    if (t <= 0) return 0;
    if (t < out) return smooth(t / out);
    if (t < out + hold) return 1;
    if (t < out + hold + back) return 1 - smooth((t - out - hold) / back);
    return 0;
  };
  function cueShape(phase, double) {
    if (!double) return pulse(phase, 0, .28, .12, .28);
    return Math.max(pulse(phase, 0, .14, .05, .14), pulse(phase, .36, .14, .05, .14));
  }
  const cueLoopMs = double => (double ? 2800 : 2400);
  const cueOutlineMaterial = new THREE.LineBasicMaterial({ color: '#65e8ff', transparent: true, opacity: .75, toneMapped: false });
  const cueQuat = new THREE.Quaternion();
  const cueWorld = new THREE.Vector3();
  function cueIdle() { return !moveAnimation && !liveMoveRunning && liveMoveQueue.length === 0; }
  function teardownCue() {
    if (!cueLive) return;
    for (const { object, position, quaternion } of cueLive.members) { object.position.copy(position); object.quaternion.copy(quaternion); }
    if (cueLive.outline) { cubeGroup.remove(cueLive.outline); cueLive.outline.children[0].geometry.dispose(); }
    cueLive = null;
    delete renderer.domElement.dataset.cue;
    delete renderer.domElement.dataset.cueLayers;
  }
  function buildCue(held, now) {
    const { move } = cueWanted;
    const spec = toPhysicalTurn(move, held);
    const double = Math.abs(spec.angle) > 90;
    const members = cubieMembers(spec).map(object => ({ object, position: object.position.clone(), quaternion: object.quaternion.clone() }));
    let outline = null;
    if (spec.kind !== 'rot') {
      const mean = spec.layers.reduce((sum, layer) => sum + layer, 0) / spec.layers.length;
      const size = spec.axis.map(component => (component ? spec.layers.length + .06 : 3.06));
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size.map(Math.abs))), cueOutlineMaterial);
      box.position.set(...spec.axis.map(component => component * mean));
      box.renderOrder = 10;
      // the box sits at the layer's centre; the pivot turns it about the cube's axis
      outline = new THREE.Group();
      outline.add(box);
      cubeGroup.add(outline);
    }
    const peak = spec.kind === 'rot' ? (double ? CUE_PEAK.rotDouble : CUE_PEAK.rot) : (double ? CUE_PEAK.double : CUE_PEAK.quarter);
    cueLive = { key: `${move}|${held.bottom}${held.front}`, spec, held, axis: new THREE.Vector3(...spec.axis), peak, double, members, outline, startedAt: now + CUE_START_DELAY_MS, angle: 0 };
    renderer.domElement.dataset.cue = spec.move;
    renderer.domElement.dataset.cueLayers = spec.layers.join(',');
  }
  function tickCue(now) {
    if (!cueWanted || !cueIdle()) { teardownCue(); return; }
    const held = cueWanted.held ?? getHeldFaces();
    const key = `${cueWanted.move}|${held.bottom}${held.front}`;
    if (cueLive && cueLive.key !== key) teardownCue();
    if (!cueLive) buildCue(held, now);
    const live = cueLive;
    let fraction;
    if (cueWanted.pose != null) fraction = cueWanted.pose;
    else if (!cueWanted.loop || reducedMotion.matches) fraction = CUE_STILL_POSE;
    else if (now < live.startedAt) fraction = 0;
    else {
      const period = cueLoopMs(live.double);
      fraction = cueShape(((now - live.startedAt) % period) / period, live.double);
    }
    const angle = Math.sign(live.spec.angle) * live.peak * fraction;
    live.angle = angle;
    cueQuat.setFromAxisAngle(live.axis, angle * Math.PI / 180);
    for (const { object, position, quaternion } of live.members) {
      object.position.copy(position).applyQuaternion(cueQuat);
      object.quaternion.copy(cueQuat).multiply(quaternion);
    }
    if (live.outline) live.outline.quaternion.copy(cueQuat);
  }
  /** Start (or restart) the cue for `move`. Returns an id for clearCue. An unparseable move clears it. */
  function setCue(move, { loop = true, held = null, pose = null } = {}) {
    teardownCue();
    const text = String(move || '').trim();
    if (!isMove(text)) { cueWanted = null; return 0; }
    cueWanted = { id: ++cueSequence, move: text, held, loop: Boolean(loop), pose };
    renderer.domElement.dataset.cueLoop = String(Boolean(loop) && !reducedMotion.matches && pose == null);
    return cueWanted.id;
  }
  function clearCue(id) {
    if (id !== undefined && cueWanted?.id !== id) return;
    cueWanted = null;
    teardownCue();
    delete renderer.domElement.dataset.cueLoop;
  }
  /**
   * What the cue is doing now: { move, layer, angle, ... } (angle in degrees about `axis`,
   * in the cube's own colour frame; right-handed, so R is negative). `layer` is the physical
   * face for face and wide moves, else the move letter. `worldAxis` is the axis after the
   * gyro / held rotation. `active` is false while a real turn owns the cube (angle 0).
   */
  function getCueState() {
    if (!cueWanted) return null;
    const live = cueLive;
    const spec = live?.spec ?? toPhysicalTurn(cueWanted.move, cueWanted.held ?? getHeldFaces());
    const axis = live?.axis ?? new THREE.Vector3(...spec.axis);
    cueWorld.copy(axis).applyQuaternion(cubeGroup.quaternion);
    return {
      id: cueWanted.id, move: cueWanted.move, kind: spec.kind, layer: spec.face ?? spec.move.replace(/['2]$/, ''),
      layers: [...spec.layers], axis: [...spec.axis], worldAxis: cueWorld.toArray().map(n => Math.round(n * 1000) / 1000),
      direction: Math.sign(spec.angle), target: spec.angle, angle: live?.angle ?? 0, active: Boolean(live),
    };
  }

  // Read the projected puzzle bounds on demand; the canvas includes empty
  // camera framing space that is not a label collision obstacle.
  renderer.domElement.getRenderedCubeBounds = () => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const rect = renderer.domElement.getBoundingClientRect();
    const points = [];
    for (const mesh of pickMeshes) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).project(camera);
        points.push({ x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 });
      }
    }
    return { points: convexHull(points), left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)),
      top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)) };
  };

  return {
    update,
    animateMove,
    setCue,
    clearCue,
    getCueState,
    setTurnHint,
    queueLiveMove,
    setMode,
    setViewOffset,
    setOrientation,
    setGyroOrientation,
    recenterGyro,
    getHeldFaces,
    setFullTouchRotation,
    resetView() {
      setMode(interactionMode);
      if (interactionMode === 'scout') recenterGyro();
    },
    destroy() {
      liveMoveQueue = [];
      cancelMoveAnimation();
      clearCue();
      cueOutlineMaterial.dispose();
      setTurnHint(null);
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
