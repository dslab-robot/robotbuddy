import * as THREE from 'three';
import {loadMeshPack} from './teaching-rig-model.js';

const radians = THREE.MathUtils.degToRad;
const shell = new THREE.MeshStandardMaterial({color: '#e9e8dc', roughness: .63, side: THREE.DoubleSide});
const trim = new THREE.MeshStandardMaterial({color: '#247d70', roughness: .55});
const hinge = new THREE.MeshStandardMaterial({color: '#324449', roughness: .65});

function part(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function greg06(root) {
  const radius = .092;
  const body = new THREE.Group();
  root.add(body);
  part(body, new THREE.SphereGeometry(radius, 48, 22, 0, 2*Math.PI, 0, Math.PI/2-.028), shell, 0, 0, 0);
  part(body, new THREE.CylinderGeometry(.082,.082,.012,48), trim, 0,-.006,0);
  const sensor = part(body,new THREE.BoxGeometry(.034,.014,.018),hinge,0,.050,.078);
  for (const x of [-.009,.009]) {
    const lens = part(sensor,new THREE.CylinderGeometry(.005,.005,.004,16),trim,x,0,.010);
    lens.rotation.x = Math.PI/2;
  }
  const legs = Array.from({length:4}, (_,i) => {
    const sector = new THREE.Group();
    sector.rotation.y = i*Math.PI/2;
    body.add(sector);
    const door = new THREE.Group();
    sector.add(door);
    door.position.x = -.065;
    part(door,new THREE.SphereGeometry(radius,18,20,-Math.PI/4+.025,Math.PI/2-.050,Math.PI/2+.018,Math.PI/2-.023),shell,.065,0,0);
    const thigh = new THREE.Group();
    sector.add(thigh);
    thigh.position.set(-.044,-.014,0);
    part(thigh,new THREE.SphereGeometry(.011,18,12),hinge,0,0,0);
    part(thigh,new THREE.BoxGeometry(.059,.013,.016),trim,-.030,0,0);
    const knee = new THREE.Group();
    knee.position.x=-.059;
    thigh.add(knee);
    part(knee,new THREE.SphereGeometry(.009,16,12),hinge,0,0,0);
    part(knee,new THREE.BoxGeometry(.062,.011,.015),trim,-.031,0,0);
    part(knee,new THREE.SphereGeometry(.009,16,12),hinge,-.062,0,0);
    return {door,thigh,knee};
  });
  return ([opening,lift,left]) => {
    const deploy = Math.min(1,Math.max(0,lift/65));
    body.position.y = .094 + deploy*.037;
    for (const [index,leg] of legs.entries()) {
      leg.door.rotation.z = radians(-opening);
      leg.thigh.rotation.z = radians(128-110*deploy - (index===0 ? left : 0));
      leg.knee.rotation.z = radians(151-83*deploy);
    }
  };
}

async function cadRig(id, root, folder) {
  const createMesh = await loadMeshPack(folder);
  const group = new THREE.Group();
  root.add(group);
  const body = createMesh('body');
  group.add(body);
  if (id === 'morphoball') {
    const sides = [['left',-1],['right',1]].map(([name,direction]) => {
      const pivot = new THREE.Group();
      group.add(pivot);
      const part = createMesh(name,direction<0 ? [.32,.48,.52] : [.37,.52,.56]);
      part.position.x = -direction*.072;
      pivot.add(part);
      return {pivot,direction};
    });
    return ([extend,swing]) => {
      for (const {pivot,direction} of sides) {
        pivot.position.x=direction*(.072+(extend-70)*.00055);
        pivot.rotation.z=direction*radians(swing);
      }
      group.position.y=.103;
    };
  }
  const sectors = [];
  for (const [prefix,indices] of [['down',[1,2,3,4,5,6]],['up',[1,7,8,9,10,11]]]) {
    for (const index of indices) {
      const mesh = createMesh(prefix+index,prefix==='up' ? [.37,.55,.61] : [.25,.39,.44]);
      mesh.geometry.computeBoundingBox();
      const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
      const direction = new THREE.Vector3(center.x,0,center.z).normalize();
      const pivot = new THREE.Group();
      const anchor = direction.clone().multiplyScalar(.077);
      mesh.position.copy(anchor).negate();
      pivot.add(mesh);
      group.add(pivot);
      sectors.push({pivot,anchor,direction,prefix,axis:new THREE.Vector3(direction.z,0,-direction.x)});
    }
  }
  return ([deploy,open]) => {
    for (const {pivot,anchor,direction,prefix,axis} of sectors) {
      pivot.position.copy(anchor).addScaledVector(direction,(deploy-70)*.0006);
      pivot.quaternion.setFromAxisAngle(axis,radians((prefix==='up' ? 1 : -.4)*(open-42)));
    }
    group.position.y=.203;
  };
}

export function loadTransformRig(id, root, modelFolder) {
  root.rotation.x=0;
  return id==='greg06-ball' ? greg06(root) : cadRig(id,root,modelFolder);
}

