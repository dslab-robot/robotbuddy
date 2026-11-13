import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {fetchRigAsset, loadArticulation, loadMeshPack} from './teaching-rig-model.js';
import {$, log, armModel, rigProfile} from './program.js';

const isDog = armModel === 'go2';
const isFr3 = armModel === 'fr3';
const isDuck = armModel === 'microduck';
const home = rigProfile.poses[rigProfile.home].angles;
export const state = {ready: false, angles: [...home], grip: 'open', gripOpening: 1};
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3f7f5');
const camera = new THREE.PerspectiveCamera(36, 1, .005, 20);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = isDog || isFr3 ? .35 : .14;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI * .49;

const light = new THREE.DirectionalLight(0xffffff, 2.15);
light.position.set(1, 2, 1.25);
light.castShadow = true;
light.shadow.mapSize.set(1024, 1024);
Object.assign(light.shadow.camera, {left: -1, right: 1, top: 1, bottom: -1});
light.shadow.bias = -.00035;
scene.add(new THREE.HemisphereLight(0xffffff, 0xa5b6ad, 1.65), light);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
  new THREE.MeshStandardMaterial({color: '#eaf2ed', roughness: .95}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.002;
floor.receiveShadow = true;
scene.add(floor, new THREE.GridHelper(isDog || isFr3 ? 5 : 2, 50, 0xb7cfc3, 0xd3e2da));

const rig = new THREE.Group();
rig.rotation.x = -Math.PI / 2; // Z-up source model in the Y-up scene.
scene.add(rig);
const modelFolder = new URL(`./models/${armModel}/`, import.meta.url);
let renderPose;
let modelBounds;
let needsRender = true;
controls.addEventListener('change', () => { needsRender = true; });

async function loadHand(createMesh) {
  const {geoms} = await fetchRigAsset(modelFolder, 'hand-rig.json').then(r => r.json());
  const poseQuaternion = new THREE.Quaternion();
  const targetQuaternion = new THREE.Quaternion();
  const animated = [];
  for (const part of geoms) {
    const mesh = createMesh(part.mesh, part.color);
    mesh.position.fromArray(part.frames[0]);
    mesh.quaternion.fromArray(part.frames[0], 3);
    rig.add(mesh);
    if (part.frames.length > 1) animated.push({mesh, frames: part.frames, finger: part.finger});
  }
  const bounds = new THREE.Box3().setFromObject(rig);
  rig.position.y = .003 - bounds.min.y;
  return bends => {
    for (const {mesh, frames, finger} of animated) {
      const progress = THREE.MathUtils.clamp(bends[finger], 0, 1) * (frames.length - 1);
      const index = Math.floor(progress);
      const from = frames[index];
      const to = frames[Math.min(index + 1, frames.length - 1)];
      const mix = progress - index;
      mesh.position.set(
        THREE.MathUtils.lerp(from[0], to[0], mix),
        THREE.MathUtils.lerp(from[1], to[1], mix),
        THREE.MathUtils.lerp(from[2], to[2], mix),
      );
      mesh.quaternion.copy(poseQuaternion.fromArray(from, 3)).slerp(targetQuaternion.fromArray(to, 3), mix);
    }
  };
}

export function setPose(angles) {
  needsRender = true;
  state.angles = [...angles];
  renderPose?.(angles);
  const pose = Object.values(rigProfile.poses).find(item =>
    item.angles?.every((angle, index) => Math.abs(angle - angles[index]) < .01));
  const values = rigProfile.telemetry ? rigProfile.telemetry.map(index => angles[index]) :
    isDog ? angles.slice(0, 3) : isDuck ? [angles[7], angles[14]] : angles;
  $('joint-value').textContent = rigProfile.joints
    ? values.map(angle => Number(angle.toFixed(1)) + '°').join(' / ')
    : values.map(bend => Math.round(bend * 100) + '%').join(' / ');
  $('grip-value').textContent = isDuck
    ? (angles[14] < .05 ? '合上' : angles[14] >= 17.95 ? '张开' : '开合中')
    : pose?.label ?? (rigProfile.joints ? '自定义姿态' : '动作中');
}

const walkMarkers = new THREE.Group();
const routeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color: '#177a67'}));
routeLine.visible = false;
const zUp = rig.quaternion.clone();
const rootRotation = new THREE.Quaternion();
const rootOffset = new THREE.Vector3();
let walkGoal = null;
let walkBounds = null;
if (isDuck) {
  for (const color of ['#d48130', '#218b73']) {
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(.008, .34),
      new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = .001;
    walkMarkers.add(marker);
  }
  walkMarkers.visible = false;
  scene.add(walkMarkers, routeLine);
}

function expandMotionBounds(poses) {
  const corner = new THREE.Vector3();
  for (const [x, y] of poses) {
    walkBounds.expandByPoint(corner.set(x - .08, 0, -y - .08));
    walkBounds.expandByPoint(corner.set(x + .08, .29, -y + .08));
  }
}

export function prepareWalk(distance, poses = []) {
  walkGoal = distance;
  walkBounds = new THREE.Box3(new THREE.Vector3(-.08, 0, -.17), new THREE.Vector3(distance + .08, .29, .17));
  expandMotionBounds(poses);
  for (const [index, marker] of walkMarkers.children.entries()) {
    marker.position.x = index * distance;
    marker.position.z = (walkBounds.min.z + walkBounds.max.z) / 2;
    marker.scale.y = (walkBounds.max.z - walkBounds.min.z) / .34;
  }
  walkMarkers.visible = true;
  view();
}

export function prepareRoute(poses) {
  walkGoal = 0;
  walkBounds = new THREE.Box3(new THREE.Vector3(-.08, 0, -.08), new THREE.Vector3(.08, .29, .08));
  expandMotionBounds(poses);
  walkMarkers.visible = false;
  routeLine.geometry.dispose();
  routeLine.geometry = new THREE.BufferGeometry().setFromPoints(poses.map(([x, y]) => new THREE.Vector3(x, .003, -y)));
  routeLine.geometry.setDrawRange(0, 0);
  routeLine.visible = true;
  view();
}

export function showWalkFrame(frame, frameIndex) {
  const [x, y, z, qw, qx, qy, qz] = frame;
  rig.quaternion.copy(zUp).multiply(rootRotation.set(qx, qy, qz, qw).normalize());
  rig.position.set(x, z, -y).add(rootOffset.set(0, 0, -.12).applyQuaternion(rig.quaternion));
  renderPose([...frame.slice(7, 21), frame[21] ?? 0].map(THREE.MathUtils.radToDeg), {grounded: false});
  if (routeLine.visible) routeLine.geometry.setDrawRange(0, frameIndex + 1);
  needsRender = true;
}

export function clearWalk() {
  if (walkGoal === null) return;
  walkGoal = null;
  walkBounds = null;
  walkMarkers.visible = false;
  routeLine.visible = false;
  rig.position.set(0, 0, 0);
  rig.quaternion.copy(zUp);
  setPose(home);
  view();
}

function view(mode = 'iso') {
  if (walkGoal !== null) {
    walkBounds.getCenter(controls.target);
    const radius = walkBounds.getSize(new THREE.Vector3()).length() / 2;
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = radius * 1.06 / Math.sin(Math.min(vertical, horizontal));
    const offset = mode === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(.35, .37, .86);
    camera.position.copy(controls.target).addScaledVector(offset.normalize(), distance);
    controls.update();
    needsRender = true;
    return;
  }
  if (modelBounds) {
    modelBounds.getCenter(controls.target);
    const radius = modelBounds.getSize(new THREE.Vector3()).length() / 2;
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = radius * (mode === 'focus' ? .83 : 1.14) / Math.sin(Math.min(vertical, horizontal));
    const direction = mode === 'top' ? new THREE.Vector3(0, 1, .001) : new THREE.Vector3(1, .57, .91);
    camera.position.copy(controls.target).addScaledVector(direction.normalize(), distance);
    controls.update();
    return;
  }
  if (isDuck) {
    controls.target.set(.025, .125, 0);
    if (mode === 'top') camera.position.set(.025, .75, .001);
    else if (mode === 'focus') camera.position.set(.36, .29, .27);
    else camera.position.set(.51, .31, .37);
    controls.update();
    return;
  }
  controls.target.set(0, isFr3 ? .40 : isDog ? .20 : .085, 0);
  if (mode === 'top') camera.position.set(0, isDog || isFr3 ? 1.8 : .55, .001);
  else if (mode === 'focus') camera.position.set(...(isFr3 ? [1.06, .73, 1.05] : isDog ? [.65, .42, -.60] : [.24, .20, -.23]));
  else camera.position.set(...(isFr3 ? [1.35, .84, 1.45] : isDog ? [1.05, .68, -.88] : [.34, .24, -.34]));
  controls.update();
}
view();
$('reset-view').onclick = () => view();
$('view-iso').onclick = () => view();
$('view-top').onclick = () => view('top');
$('focus-gripper').onclick = () => view('focus');
$('model-toggle').onclick = () => {
  rig.visible = !rig.visible;
  needsRender = true;
  $('model-toggle').textContent = rig.visible ? '隐藏模型' : '显示模型';
};

new ResizeObserver(() => {
  const {width, height} = viewport.getBoundingClientRect();
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  if (walkGoal !== null) view();
  needsRender = true;
}).observe(viewport);
renderer.setAnimationLoop(() => {
  controls.update();
  if (!isDuck || needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }
});

async function loadOctobotRig() {
  const {loadOctobot} = await import('./models/octobot/octorig.js');
  const {root, legs} = await loadOctobot(new URL('octobot.glb', modelFolder), scene);
  if (legs.length !== 8) {
    scene.remove(root);
    throw Error('Octobot 模型未找到全部八条腿');
  }
  rig.rotation.x = 0;
  rig.add(root);
  root.scale.setScalar(.20);
  const up = new THREE.Vector3(0, 1, 0);
  const foot = new THREE.Vector3();
  const rad = THREE.MathUtils.degToRad;
  return angles => {
    for (const [index, leg] of legs.entries()) {
      const [yaw, shoulder, knee] = angles.slice(index * 3, index * 3 + 3).map(rad);
      leg.hip.quaternion.setFromAxisAngle(up, yaw * leg.s0);
      leg.shoulder.quaternion.setFromAxisAngle(leg.e_t, shoulder * leg.s1);
      leg.knee.quaternion.setFromAxisAngle(leg.e_t, knee * leg.s2);
    }
    root.position.y = 0;
    root.updateMatrixWorld(true);
    root.position.y = -Math.min(...legs.map(leg => leg.knee.localToWorld(foot.copy(leg.footLocal)).y));
  };
}

async function load() {
  try {
    if (rigProfile.transform) {
      const {loadTransformRig} = await import('./scene-transform-rig.js');
      renderPose = await loadTransformRig(armModel, rig, modelFolder);
    } else if (armModel === 'octobot') {
      renderPose = await loadOctobotRig();
    } else {
      const createMesh = rigProfile.articulation?.visuals === 'urdf' ? null : await loadMeshPack(modelFolder);
      renderPose = await (rigProfile.articulation
        ? loadArticulation(rig, modelFolder, createMesh, rigProfile.articulation)
        : loadHand(createMesh));
    }
    state.ready = true;
    setPose(home);
    if (rigProfile.frameModel) {
      modelBounds = new THREE.Box3().setFromObject(rig);
      view();
    }
    $('loading').style.display = 'none';
    $('focus-gripper').disabled = false;
    $('scene-status').textContent = rigProfile.badge;
    $('device-sub').textContent = rigProfile.source;
    log(rigProfile.source + ' 已载入');
  } catch (error) {
    $('loading').style.display = 'none';
    $('scene-status').textContent = '模型载入失败';
    $('device-sub').textContent = '请查看执行记录';
    log(error.message, true);
  }
}
load();
