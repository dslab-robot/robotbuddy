import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {loadMeshPack, loadArticulation} from './teaching-rig-model.js';
import {rigProfiles} from './rig-profiles.js';

const profile = rigProfiles.microduck;
const modelFolder = new URL('./models/microduck/', import.meta.url);

export async function createTrainingScene(viewport, {walking = false, turning = false, recovery = false, onFrame = () => {}} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf5ef');
  const camera = new THREE.PerspectiveCamera(37, 1, .005, 10);
  camera.position.set(.82, .47, .63);
  const renderer = new THREE.WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(.21, .16, 0);
  controls.enableDamping = true;
  controls.minDistance = .3;
  controls.maxDistance = 3;
  controls.update();

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(.65, 1.4, .8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, {left: -.75, right: .75, top: .75, bottom: -.75});
  light.shadow.bias = -.00025;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb1c5b5, 1.65), light);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({color: '#e5f0e7'}));
  ground.position.y = -.002;
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground, new THREE.GridHelper(2.5, 50, 0xb5c9bd, 0xd2e0d7));

  const robot = new THREE.Group();
  const zUp = new THREE.Group();
  zUp.rotation.x = -Math.PI / 2;
  const trunk = new THREE.Group();
  const distanceMarkers = [];
  const corridorEdges = [];
  const turnArrows = [];
  if (walking) {
    scene.add(zUp);
    zUp.add(trunk);
    trunk.add(robot);
    robot.position.z = -.12;
    trunk.position.z = .12;
    if (turning) {
      for (const color of ['#d48130', '#268b6a']) {
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, .006),
          .19, color, .04, .025);
        zUp.add(arrow);
        turnArrows.push(arrow);
      }
    }
    for (const [x, color] of (turning || recovery ? [] : [[0, '#d48130'], [.5, '#268b6a']])) {
      const marker = new THREE.Mesh(new THREE.PlaneGeometry(.007, .24), new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide}));
      marker.position.set(x, 0, .001);
      zUp.add(marker);
      distanceMarkers.push(marker);
    }
    for (const y of (turning || recovery ? [] : [-.12, .12])) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(.5, .002), new THREE.MeshBasicMaterial({color: '#86ad9b', side: THREE.DoubleSide}));
      edge.position.set(.25, y, .001);
      zUp.add(edge);
      corridorEdges.push(edge);
    }
  } else {
    robot.rotation.x = -Math.PI / 2;
    scene.add(robot);
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.015, 20, 12),
    new THREE.MeshStandardMaterial({color: '#e9983d', roughness: .58}));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const linePositions = new Float32Array(6);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const ray = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({color: '#148a6d'}));
  ray.visible = false;
  ray.frustumCulled = false;
  scene.add(ray);

  const mesh = await loadMeshPack(modelFolder);
  const articulation = walking ? {...profile.articulation, feet: [], groundMeshes: []} : profile.articulation;
  const pose = await loadArticulation(robot, modelFolder, mesh, articulation);
  pose(profile.poses[profile.home].angles);
  const eye = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let playback = null;
  let frameIndex = -1;
  let startTime = 0;
  let needsRender = true;
  let initialHeading = 0;
  let turnSign = 1;

  function yaw(frame) {
    const [, , , w, x, y, z] = frame;
    return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  }

  function setDirection(arrow, heading) {
    arrow.setDirection(new THREE.Vector3(Math.cos(heading), Math.sin(heading), 0));
  }

  function setDistance(distance) {
    if (!distanceMarkers.length) return;
    distanceMarkers[1].position.x = distance;
    for (const edge of corridorEdges) {
      edge.position.x = distance / 2;
      edge.scale.x = distance / .5;
    }
    needsRender = true;
  }
  controls.addEventListener('change', () => { needsRender = true; });

  function drawFrame(frame, target) {
    needsRender = true;
    if (walking) {
      trunk.position.set(frame[0], frame[1], frame[2]);
      trunk.quaternion.set(frame[4], frame[5], frame[6], frame[3]).normalize();
      pose([...frame.slice(7, 21), frame[21] ?? 0].map(THREE.MathUtils.radToDeg));
      if (turning) {
        const delta = yaw(frame) - initialHeading;
        let angle = turnSign * THREE.MathUtils.radToDeg(Math.atan2(Math.sin(delta), Math.cos(delta)));
        if (playback?.angle >= 135 && angle < -150) angle += 360;
        onFrame(angle);
      } else onFrame(frame[0], frameIndex);
      return;
    }
    pose([...frame.slice(0, 14), 0]);
    ball.position.set(target[0], target[2] + robot.position.y, -target[1]);
    eye.set(frame[14], frame[16] + robot.position.y, -frame[15]);
    direction.set(frame[17], frame[19], -frame[18]).normalize();
    tip.copy(eye).addScaledVector(direction, eye.distanceTo(ball.position));
    linePositions.set(eye.toArray(), 0);
    linePositions.set(tip.toArray(), 3);
    lineGeometry.attributes.position.needsUpdate = true;
  }

  function play(replay) {
    playback = replay;
    startTime = performance.now();
    frameIndex = 0;
    ball.visible = ray.visible = !walking;
    if (recovery) focus.set(0, .10, 0);
    else if (turning) {
      initialHeading = yaw(replay.poses[0]);
      turnSign = replay.direction === 'right' ? -1 : 1;
      setDirection(turnArrows[0], initialHeading);
      setDirection(turnArrows[1], initialHeading + turnSign * THREE.MathUtils.degToRad(replay.angle));
      focus.set(0, .10, 0);
    } else if (walking) {
      setDistance(replay.goal);
      focus.set(replay.goal / 2, .10, 0);
    } else focus.set(replay.goal[0] * .45, .17, -replay.goal[1] * .43);
    camera.position.sub(controls.target).add(focus);
    controls.target.copy(focus);
    controls.update();
    drawFrame(replay.poses[0], replay.goal);
  }

  function previewPose(frame) {
    playback = null;
    frameIndex = 0;
    drawFrame(frame);
  }

  function previewTarget(target) {
    if (walking) return;
    playback = null;
    ball.visible = true;
    ray.visible = false;
    ball.position.set(target[0], target[2] + robot.position.y, -target[1]);
    focus.set(target[0] * .45, .17, -target[1] * .43);
    camera.position.sub(controls.target).add(focus);
    controls.target.copy(focus);
    controls.update();
    needsRender = true;
  }

  function reset() {
    needsRender = true;
    playback = null;
    if (walking) {
      trunk.position.set(0, 0, .12);
      trunk.quaternion.identity();
      if (turning) { setDirection(turnArrows[0], 0); setDirection(turnArrows[1], Math.PI / 2); }
      onFrame(0);
    }
    ball.visible = ray.visible = false;
    pose(profile.poses[profile.home].angles);
  }

  new ResizeObserver(() => {
    const {clientWidth: width, clientHeight: height} = viewport;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    needsRender = true;
  }).observe(viewport);

  renderer.setAnimationLoop(now => {
    if (playback) {
      const index = Math.max(0, Math.min(playback.poses.length - 1, Math.floor((now - startTime) / playback.stepMs)));
      if (index !== frameIndex) {
        frameIndex = index;
        drawFrame(playback.poses[index], playback.goal);
      }
    }
    controls.update();
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  });

  if (turning) {
    setDirection(turnArrows[1], Math.PI / 2);
    controls.target.set(0, .10, 0);
    camera.position.set(.49, .37, .52);
    controls.update();
  }
  if (recovery) {
    controls.target.set(0, .10, 0);
    camera.position.set(.44, .30, .43);
    controls.update();
  }
  return {play, reset, setDistance, previewTarget, previewPose};
}
