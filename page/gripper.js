import * as T from 'three';

// Independent rigid parts, dimensions in metres; Z points up along the tool.
// This is a teaching parallel gripper, not a manufacturer CAD model.
export function createGripper(){
  const group=new T.Group();group.name='TeachingParallelGripper';
  const silver=new T.MeshStandardMaterial({color:'#abb8bf',metalness:.75,roughness:.3});
  const dark=new T.MeshStandardMaterial({color:'#263337',metalness:.4,roughness:.42});
  const rubber=new T.MeshStandardMaterial({color:'#1b2629',roughness:.95});
  const accent=new T.MeshStandardMaterial({color:'#168d7b',metalness:.3,roughness:.35});
  function box(parent,name,size,pos,material){const o=new T.Mesh(new T.BoxGeometry(...size),material);o.name=name;o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function cylinder(parent,r,h,pos,material){const o=new T.Mesh(new T.CylinderGeometry(r,r,h,24),material);o.rotation.x=Math.PI/2;o.position.set(...pos);o.castShadow=true;parent.add(o);return o;}
  cylinder(group,.012,.006,[0,0,-.003],dark);
  box(group,'Actuator housing',[.052,.026,.024],[0,0,-.018],silver);
  box(group,'Motor cover',[.03,.027,.011],[0,0,-.012],dark);
  box(group,'Status strip',[.021,.001,.003],[0,-.014,-.014],accent);
  box(group,'Guide rail',[.06,.014,.006],[0,0,-.033],dark);
  for(const side of [-1,1])for(const y of [-1,1])cylinder(group,.002,.001,[side*.019,y*.009,-.005],dark);
  const fingers=[];
  for(const side of [-1,1]){
    const finger=new T.Group();finger.name=side<0?'LeftJaw':'RightJaw';group.add(finger);fingers.push(finger);
    box(finger,'Sliding carriage',[.012,.022,.009],[0,0,-.035],silver);
    box(finger,'Finger',[.007,.018,.035],[0,0,-.055],silver);
    box(finger,'Rubber contact pad',[.003,.019,.024],[-side*.004,0,-.06],rubber);
    for(let i=0;i<4;i++)box(finger,'Pad groove',[.0008,.0195,.0007],[-side*.0058,0,-.051-i*.005],dark);
  }
  function setOpening(value){const v=T.MathUtils.clamp(value,0,1);fingers.forEach((finger,i)=>finger.position.x=(i===0?-1:1)*(.007+.022*v));group.userData.opening=v;}
  setOpening(1);return {group,setOpening};
}
