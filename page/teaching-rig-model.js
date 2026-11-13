import * as THREE from 'three';
import {STLLoader} from './vendor/STLLoader.js';

export async function fetchRigAsset(modelFolder, file) {
  const response = await fetch(new URL(file, modelFolder));
  if (!response.ok) throw Error(`${file} 载入失败 (${response.status})`);
  return response;
}

export async function loadMeshPack(modelFolder) {
  const [pack, buffer] = await Promise.all([
    fetchRigAsset(modelFolder, 'meshes.json').then(r => r.json()),
    fetchRigAsset(modelFolder, 'meshes.bin').then(r => r.arrayBuffer()),
  ]);
  const materials = new Map();
  function material(rgb) {
    const key = rgb.join(',');
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(...rgb), roughness: .52, metalness: .10,
      }));
    }
    return materials.get(key);
  }
  const meshes = new Map(Object.entries(pack).map(([name, data]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, ...data.positions), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, ...data.indices), 1));
    if (data.normals) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffer, ...data.normals), 3));
    } else {
      geometry.computeVertexNormals();
    }
    const surface = data.materials.map(([start, count, color], index) => {
      geometry.addGroup(start, count, index);
      return material(color);
    });
    return [name, {geometry, surface}];
  }));
  return (name, color) => {
    const data = meshes.get(name);
    if (!data) throw Error('模型缺少部件 ' + name);
    const mesh = new THREE.Mesh(data.geometry, color ? material(color) : data.surface);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
}

function setOrigin(group, origin) {
  if (!origin) return;
  group.position.fromArray((origin.getAttribute('xyz') || '0 0 0').split(/\s+/).map(Number));
  group.rotation.set(...(origin.getAttribute('rpy') || '0 0 0').split(/\s+/).map(Number), 'ZYX');
}

export async function loadArticulation(rig, modelFolder, createMesh, {file, root, jointNames, feet = [], groundMeshes = [], visuals}) {
  const source = await fetchRigAsset(modelFolder, file).then(r => r.text());
  const xml = new DOMParser().parseFromString(source, 'application/xml');
  if (xml.querySelector('parsererror')) throw Error('关节文件格式有误');
  const links = new Map();
  const geometry = new Map();
  const materials = new Map();
  if (visuals === 'urdf') {
    const loader = new STLLoader();
    const filenames = [...new Set([...xml.querySelectorAll('visual mesh')].map(mesh => mesh.getAttribute('filename')))];
    await Promise.all(filenames.map(async filename => {
      const buffer = await fetchRigAsset(modelFolder, filename).then(response => response.arrayBuffer());
      geometry.set(filename, loader.parse(buffer));
    }));
    for (const material of xml.querySelectorAll('robot > material')) {
      const color = material.querySelector('color')?.getAttribute('rgba');
      if (color) materials.set(material.getAttribute('name'), color);
    }
  }
  const surfaces = new Map();
  function urdfMesh(visual) {
    const shape = visual.querySelector('geometry')?.firstElementChild;
    if (!shape) return null;
    let shapeGeometry;
    const number = attr => Number(shape.getAttribute(attr));
    if (shape.tagName === 'mesh') shapeGeometry = geometry.get(shape.getAttribute('filename'));
    if (shape.tagName === 'box') shapeGeometry = new THREE.BoxGeometry(...shape.getAttribute('size').split(/\s+/).map(Number));
    if (shape.tagName === 'cylinder') {
      const radius = number('radius');
      shapeGeometry = new THREE.CylinderGeometry(radius, radius, number('length'), 24);
      shapeGeometry.rotateX(Math.PI / 2);
    }
    if (shape.tagName === 'sphere') shapeGeometry = new THREE.SphereGeometry(number('radius'), 20, 12);
    if (!shapeGeometry) return null;
    const material = visual.querySelector('material');
    const rgba = material?.querySelector('color')?.getAttribute('rgba') ||
      materials.get(material?.getAttribute('name')) || '.72 .75 .74 1';
    if (!surfaces.has(rgba)) {
      const [r, g, b, opacity] = rgba.trim().split(/\s+/).map(Number);
      surfaces.set(rgba, new THREE.MeshStandardMaterial({
        color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
        roughness: .62, opacity, transparent: opacity < 1,
      }));
    }
    const mesh = new THREE.Mesh(shapeGeometry, surfaces.get(rgba));
    const scale = shape.getAttribute('scale');
    if (scale) mesh.scale.fromArray(scale.trim().split(/\s+/).map(Number));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  for (const link of xml.querySelectorAll('robot > link')) {
    const group = new THREE.Group();
    const name = link.getAttribute('name');
    group.name = name;
    links.set(name, group);
    for (const visual of link.querySelectorAll('visual')) {
      const file = visual.querySelector('mesh')?.getAttribute('filename');
      const mesh = visuals === 'urdf' ? urdfMesh(visual) :
        file && createMesh(file.split('/').at(-1).replace(/\.dae$/, ''));
      if (!mesh) continue;
      setOrigin(mesh, visual.querySelector('origin'));
      group.add(mesh);
    }
  }
  const joints = new Map();
  for (const joint of xml.querySelectorAll('robot > joint')) {
    const pivot = new THREE.Group();
    setOrigin(pivot, joint.querySelector('origin'));
    const motion = new THREE.Group();
    pivot.add(motion);
    motion.add(links.get(joint.querySelector('child').getAttribute('link')));
    links.get(joint.querySelector('parent').getAttribute('link')).add(pivot);
    if (joint.getAttribute('type') === 'revolute') {
      const axis = new THREE.Vector3().fromArray(joint.querySelector('axis').getAttribute('xyz').split(/\s+/).map(Number));
      const mimic = joint.querySelector('mimic');
      joints.set(joint.getAttribute('name'), {motion, axis: axis.normalize(), mimic});
    }
  }
  if (!links.has(root) || !jointNames.every(name => joints.has(name))) throw Error('模型的连杆或关节不完整');
  rig.add(links.get(root));
  const footLinks = feet.map(name => links.get(name));
  const groundLinks = groundMeshes.map(name => links.get(name));
  const groundBounds = new THREE.Box3();
  const position = new THREE.Vector3();
  return (angles, {grounded = true} = {}) => {
    jointNames.forEach((name, index) => {
      const {motion, axis} = joints.get(name);
      motion.quaternion.setFromAxisAngle(axis, THREE.MathUtils.degToRad(angles[index]));
    });
    for (const {motion, axis, mimic} of joints.values()) {
      if (!mimic) continue;
      const index = jointNames.indexOf(mimic.getAttribute('joint'));
      if (index < 0) continue;
      const multiplier = Number(mimic.getAttribute('multiplier') ?? 1);
      const offset = Number(mimic.getAttribute('offset') ?? 0);
      motion.quaternion.setFromAxisAngle(axis, THREE.MathUtils.degToRad(angles[index]) * multiplier + offset);
    }
    // Keep the lowest supporting foot on the virtual floor during pose previews.
    if (!grounded) return;
    if (footLinks.length) {
      rig.position.y = 0;
      rig.updateMatrixWorld(true);
      rig.position.y = .024 - Math.min(...footLinks.map(foot => foot.getWorldPosition(position).y));
    } else if (groundLinks.length) {
      rig.position.y = 0;
      rig.updateMatrixWorld(true);
      rig.position.y = .001 - Math.min(...groundLinks.map(link => groundBounds.setFromObject(link, visuals !== 'urdf').min.y));
    }
  };
}

