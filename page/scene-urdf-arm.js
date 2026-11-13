import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {STLLoader} from './vendor/STLLoader.js';
import {$, log, armModel} from './program.js';

const profiles = {
  'open-manipulator-x': {
    title: 'OpenMANIPULATOR-X', file: 'open_manipulator_x.urdf', root: 'world', base: 'link1',
    joints: ['joint1', 'joint2', 'joint3', 'joint4'], jaw: 'gripper_left_joint',
    mimicJaw: 'gripper_right_joint', tool: 'link5', hasBasePlate: true,
    cameraOffset: [1.4, .85, 1.7],
    subtitle: 'ROBOTIS · 四轴与双指夹爪',
    detail: '官方分件模型 · 含固定安装底板，双指沿相反方向滑动',
  },
  so101: {
    title: 'SO‑101', file: 'so101_new_calib.urdf', root: 'base_link', base: 'base_link',
    joints: ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'],
    jaw: 'gripper', tool: 'gripper_link', hasBasePlate: false,
    cameraOffset: [1.15, .74, 1.4],
    subtitle: 'TheRobotStudio · 五轴从臂与夹爪',
    detail: '官方分件 STL 与 URDF · 活动夹指绕轴开合',
  },
};
const profile = profiles[armModel];
const modelFolder = new URL(`./models/${armModel}/`, import.meta.url);
export const state = {ready: false, angles: profile.joints.map(() => 0), grip: 'open', gripOpening: 1};

const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#f3f7f5');
const camera = new THREE.PerspectiveCamera(36, 1, .01, 50);
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = .25;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * .49;

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {left: -2, right: 2, top: 2, bottom: -2});
sun.shadow.bias = -.0005;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9baea5, 1.7), sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({color: '#edf3ef', roughness: .95}));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -.006;
floor.receiveShadow = true;
const grid = new THREE.GridHelper(8, 40, 0xc9d9d1, 0xdfe9e3);
grid.position.y = -.003;
scene.add(floor, grid);

const robot = new THREE.Group();
robot.rotation.x = -Math.PI / 2; // URDF is Z-up, Three.js is Y-up.
robot.scale.setScalar(3);
scene.add(robot);
const joints = new Map();
const loader = new STLLoader();
const geometryCache = new Map();
const homeTarget = new THREE.Vector3(.22, .38, 0);

function numbers(element, name, fallback) {
  return element?.getAttribute(name)?.trim().split(/\s+/).map(Number) ?? fallback;
}

function place(group, origin) {
  group.position.fromArray(numbers(origin, 'xyz', [0, 0, 0]));
  group.rotation.set(...numbers(origin, 'rpy', [0, 0, 0]), 'ZYX');
}

async function loadVisual(link, target, materialColors) {
  for (const visual of link.querySelectorAll(':scope > visual')) {
    const mesh = visual.querySelector('geometry > mesh');
    if (!mesh) continue; // The URDF's tool frame marker is not a physical part.
    const filename = mesh.getAttribute('filename');
    const file = filename.startsWith('package://') ? filename.split('/').at(-1) : filename;
    const url = new URL(file, modelFolder).href;
    if (!geometryCache.has(url)) geometryCache.set(url, loader.loadAsync(url));
    const geometry = await geometryCache.get(url);
    const material = visual.querySelector('material');
    const rgb = numbers(material?.querySelector('color'), 'rgba',
      materialColors.get(material?.getAttribute('name')) ?? [.2, .2, .2, 1]);
    const part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]), roughness: .45, metalness: .12,
    }));
    part.name = file;
    part.scale.fromArray(numbers(mesh, 'scale', [1, 1, 1]));
    place(part, visual.querySelector('origin'));
    part.castShadow = part.receiveShadow = true;
    target.add(part);
  }
}

async function loadBasePlate() {
  const geometry = await loader.loadAsync(new URL('plate.stl', modelFolder).href);
  geometry.computeBoundingBox();
  const plate = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#839096', metalness: .28, roughness: .52,
  }));
  plate.name = 'ROBOTIS base plate';
  plate.scale.setScalar(.001);
  // The supplied STL uses the arm's XY origin and sits just below Z=0.
  plate.position.z = -geometry.boundingBox.max.z * plate.scale.z;
  plate.castShadow = plate.receiveShadow = true;
  robot.add(plate);
  return plate;
}

function resetView(top = false) {
  controls.target.copy(homeTarget);
  camera.position.copy(homeTarget).add(top ? new THREE.Vector3(.001, 2.65, 0) : new THREE.Vector3(...profile.cameraOffset));
  controls.update();
}

function setJointPosition(joint, position) {
  if (joint.type === 'prismatic') {
    joint.motion.position.copy(joint.axis).multiplyScalar(position);
  } else {
    joint.motion.quaternion.setFromAxisAngle(joint.axis, position);
  }
}

export function setPose(angles, grip, opening = grip === 'close' ? 0 : 1) {
  state.angles = [...angles];
  state.grip = grip;
  state.gripOpening = opening;
  angles.forEach((angle, index) => {
    const joint = joints.get(profile.joints[index]);
    if (joint) setJointPosition(joint, THREE.MathUtils.degToRad(angle));
  });
  const jaw = joints.get(profile.jaw);
  if (jaw) {
    const travel = THREE.MathUtils.lerp(jaw.lower, jaw.upper, opening);
    setJointPosition(jaw, travel);
    const follower = joints.get(profile.mimicJaw);
    if (follower) setJointPosition(follower, travel * follower.multiplier + follower.offset);
  }
  $('joint-value').textContent = angles.map(angle => `${Math.abs(angle) < .05 ? '0' : angle.toFixed(1)}°`).join(' / ');
  $('grip-value').textContent = opening >= .999 ? '张开' : opening <= .001 ? '闭合' : `${Math.round(opening * 100)}%`;
}

async function loadModel() {
  try {
    const response = await fetch(new URL(profile.file, modelFolder));
    if (!response.ok) throw Error('关节文件载入失败');
    const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
    if (xml.querySelector('parsererror')) throw Error('关节文件格式有误');
    const materialColors = new Map();
    for (const material of xml.querySelectorAll('robot > material')) {
      materialColors.set(material.getAttribute('name'), numbers(material.querySelector('color'), 'rgba', [.2, .2, .2, 1]));
    }
    const links = new Map();
    const pending = [];
    for (const link of xml.querySelectorAll('robot > link')) {
      const group = new THREE.Group();
      group.name = link.getAttribute('name');
      links.set(group.name, group);
      pending.push(loadVisual(link, group, materialColors));
    }
    robot.add(links.get(profile.root));
    for (const joint of xml.querySelectorAll('robot > joint')) {
      const frame = new THREE.Group();
      const motion = new THREE.Group();
      const limit = joint.querySelector('limit');
      const mimic = joint.querySelector('mimic');
      place(frame, joint.querySelector('origin'));
      links.get(joint.querySelector('parent').getAttribute('link')).add(frame);
      frame.add(motion);
      motion.add(links.get(joint.querySelector('child').getAttribute('link')));
      joints.set(joint.getAttribute('name'), {
        motion, type: joint.getAttribute('type'),
        axis: new THREE.Vector3().fromArray(numbers(joint.querySelector('axis'), 'xyz', [1, 0, 0])).normalize(),
        lower: Number(limit?.getAttribute('lower')),
        upper: Number(limit?.getAttribute('upper')),
        multiplier: Number(mimic?.getAttribute('multiplier') ?? 1),
        offset: Number(mimic?.getAttribute('offset') ?? 0),
      });
    }
    const [basePlate] = await Promise.all([profile.hasBasePlate ? loadBasePlate() : null, ...pending]);
    setPose(state.angles, state.grip);
    robot.updateMatrixWorld(true);
    const baseBounds = new THREE.Box3();
    const baseMeshes = basePlate ? [basePlate] : links.get(profile.base).children.filter(child => child.isMesh);
    for (const mesh of baseMeshes) baseBounds.expandByObject(mesh);
    robot.position.y -= baseBounds.min.y;
    const bounds = new THREE.Box3().setFromObject(robot);
    bounds.getCenter(homeTarget);
    resetView();
    state.ready = true;
    $('device-sub').textContent = profile.subtitle;
    $('scene-status').textContent = `${profile.title} · 关节运动预览`;
    $('model-info').textContent = profile.detail;
    const focus = $('focus-gripper');
    focus.disabled = false;
    focus.onclick = () => {
      controls.target.copy(new THREE.Box3().setFromObject(links.get(profile.tool)).getCenter(new THREE.Vector3()));
      camera.position.copy(controls.target).add(new THREE.Vector3(.44, .26, .48));
      controls.update();
    };
    log(`${profile.title} 已载入：J1–J${profile.joints.length} 和夹爪可操作`);
  } catch (error) {
    robot.clear();
    $('scene-status').textContent = '模型载入失败';
    $('device-sub').textContent = `${profile.title} 未就绪`;
    $('model-info').textContent = error.message;
    log(error.message, true);
  } finally {
    $('loading').style.display = 'none';
  }
}

resetView();
new ResizeObserver(() => {
  const {width, height} = viewport.getBoundingClientRect();
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}).observe(viewport);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
$('reset-view').onclick = $('view-iso').onclick = () => resetView();
$('view-top').onclick = () => resetView(true);
$('model-toggle').onclick = () => {
  robot.visible = !robot.visible;
  $('model-toggle').textContent = robot.visible ? '隐藏模型' : '显示模型';
};
loadModel();
