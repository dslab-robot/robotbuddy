import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {ColladaLoader} from './vendor/ColladaLoader.js';
import {$,log} from './program.js';
import {createGripper} from './gripper.js';
export const state={ready:false,angles:[0,0,0],grip:'open',gripOpening:1,model:true};
const viewport=$('viewport'),scene=new T.Scene();scene.background=new T.Color('#f3f7f5');scene.fog=new T.Fog('#f3f7f5',7,18);
const camera=new T.PerspectiveCamera(36,1,.01,100);const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;viewport.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.6;controls.maxDistance=6;controls.maxPolarAngle=Math.PI*.49;
scene.add(new T.HemisphereLight(0xffffff,0x9baea5,1.7));const sun=new T.DirectionalLight(0xffffff,2.4);sun.position.set(3,6,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2;sun.shadow.camera.right=2;sun.shadow.camera.top=2;sun.shadow.camera.bottom=-2;sun.shadow.bias=-.0005;scene.add(sun);
const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:'#edf3ef',roughness:.95}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=-.008;scene.add(floor);const grid=new T.GridHelper(10,50,0xc9d9d1,0xdfe9e3);grid.position.y=-.006;scene.add(grid);
const root=new T.Group();root.rotation.x=-Math.PI/2;root.scale.setScalar(3);scene.add(root);let joints=[],gripperRig;
function box(w,h,d,color,x,y,z){const o=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.7}));o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}box(.07,.07,.07,'#db8061',.45,.035,.2);box(.25,.005,.22,'#c9dfd3',.45,.001,-.25);
export function resetView(top=false){controls.target.set(.13,.32,0);camera.position.set(top?.13:1.6,top?2.8:1.15,top?.001:1.85);controls.update()}
resetView();new ResizeObserver(()=>{const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height)}).observe(viewport);
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
export function setPose(angles,grip,opening=grip==='close'?0:1){state.angles=[...angles];state.grip=grip;state.gripOpening=opening;const rad=Math.PI/180;if(joints.length){joints[0].rotation.z=angles[0]*rad;joints[1].rotation.y=(20+angles[1])*rad;joints[2].rotation.y=(7+angles[2])*rad;joints[3].rotation.y=-joints[1].rotation.y-joints[2].rotation.y;}gripperRig?.setOpening(opening);$('joint-value').innerHTML=angles[0].toFixed(1)+'<span> °</span>';$('grip-value').textContent=grip==='close'?'闭合':'张开';}
async function load(){try{const loader=new ColladaLoader();const names=['magicianBase','magicianLink1','magicianLink2','magicianLink3','magicianLink4'];const parts=await Promise.all(names.map(async name=>{const result=await loader.loadAsync('models/magician/'+name+'.dae');const mesh=result.scene;mesh.rotation.set(0,0,0);mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const old=Array.isArray(o.material)?o.material[0]:o.material;o.material=new T.MeshStandardMaterial({color:old?.color||'#ddddda',metalness:.22,roughness:.42,side:T.DoubleSide})}});return mesh}));
// Joint origins and visual offsets follow the source ROS magician.xml.
root.add(parts[0]);const j1=new T.Group(),j2=new T.Group(),j3=new T.Group(),j4=new T.Group(),tool=new T.Group();root.add(j1);j1.add(parts[1],j2);j2.add(parts[2],j3);parts[2].rotation.y=-20*Math.PI/180;j3.position.z=.135;parts[3].position.set(.135*Math.sin(7*Math.PI/180),0,-.135*Math.cos(7*Math.PI/180));parts[3].rotation.y=-27*Math.PI/180;j3.add(parts[3],j4);j4.position.x=.147;const x=-1*(.135*Math.sin(20*Math.PI/180)+.147*Math.cos(27*Math.PI/180));const z=.135-(.135*Math.cos(20*Math.PI/180)+.147*Math.sin(27*Math.PI/180));parts[4].position.set(x,0,z);j4.add(parts[4],tool);
tool.position.set(x + .233, 0, z + .037);
gripperRig = createGripper();
tool.add(gripperRig.group);
joints = [j1, j2, j3, j4];
setPose(state.angles,state.grip);root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(root);root.position.y-=bounds.min.y;state.ready=true;
$('device-sub').textContent='Magician · 单臂 / 双指夹爪';
$('scene-status').textContent='Magician 单臂 · 关节运动预览';
$('model-info').textContent='Magician 分体臂体与教学双指夹爪，支持关节运动及双指开合。';
log('Magician 单臂与双指夹爪已载入');
const focus = document.createElement('button');
focus.id = 'focus-gripper';
focus.title = '夹爪特写';
focus.textContent = '⊙';
document.querySelector('.view-tools').append(focus);
focus.onclick = () => {
  const center = new T.Box3().setFromObject(gripperRig.group).getCenter(new T.Vector3());
  controls.target.copy(center);
  camera.position.copy(center).add(new T.Vector3(.40, .22, .40));
  controls.update();
};
}catch(e){state.ready=false;root.clear();$('device-sub').textContent='Magician 模型载入失败';$('scene-status').textContent='模型未就绪';$('model-info').textContent=e.message;log(e.message,true)}finally{$('loading').style.display='none'}}load();
$('reset-view').onclick=()=>resetView();$('view-iso').onclick=()=>resetView();$('view-top').onclick=()=>resetView(true);$('model-toggle').onclick=()=>{root.visible=!root.visible;$('model-toggle').textContent=root.visible?'隐藏模型':'显示模型'};
window.addEventListener('error',e=>log('页面错误：'+e.message,true));


