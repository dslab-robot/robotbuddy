import {generateRigTask, rigProfiles} from './rig-profiles.js';

export const $=id=>document.getElementById(id);
export function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4000)}
export function log(s,error=false){const row=document.createElement('div');if(error)row.className='error';const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});row.append(time,document.createTextNode(s));$('log').append(row);while($('log').children.length>100)$('log').firstChild.remove();$('log').scrollTop=99999}
const B=window.Blockly;
export const armModel = document.body.dataset.arm ?? 'magician';
export const rigProfile = rigProfiles[armModel];
const isOpenManipulator = armModel === 'open-manipulator-x';
const isSO101 = armModel === 'so101';
const isMicroduck = armModel === 'microduck';
let stationaryNames = [];
export function setStationarySkills(skills) {
  stationaryNames = skills.map(skill => skill.name);
}
const jointOptions = rigProfile?.joints?.map((name, index) => [name + ' J' + (index + 1), String(index + 1)]) ?? [['底座 J1', '1'], ['肩部 J2', '2'], ['肘部 J3', '3']];
if (isOpenManipulator || isSO101) jointOptions.push(['腕部俯仰 J4', '4']);
if (isSO101) jointOptions.push(['腕部旋转 J5', '5']);
const storageKey = armModel + '-workspace';

// The OpenMANIPULATOR-X limits are rounded inward to whole degrees from its URDF.
const openManipulatorLimits = [[-180, 180], [-85, 85], [-85, 80], [-97, 112]];
const so101Limits = [[-109, 109], [-100, 100], [-96, 96], [-94, 94], [-157, 162]];
const jointLimits = rigProfile ? rigProfile.limits ?? [] : isSO101 ? so101Limits : isOpenManipulator ? openManipulatorLimits : [[-90, 90], [-90, 90], [-90, 90]];
function validateMove({joint, angle, time}) {
  const bounds = jointLimits[joint - 1];
  if (!bounds) throw Error('当前模型没有关节 J' + joint);
  const [min, max] = bounds;
  if (!Number.isFinite(angle) || angle < min || angle > max || time < .1 || time > 10) {
    throw Error(`J${joint} 角度须在 ${min}° 至 ${max}°，用时 0.1–10 秒`);
  }
}
B.defineBlocksWithJsonArray([
{type:'start',message0:'当 ▶ 运行时',nextStatement:null,colour:'#E9AC36',tooltip:'程序的起点'},
{type:'move',message0:'移动关节 %1 到 %2 °  用时 %3 秒',args0:[{type:'field_dropdown',name:'JOINT',options:jointOptions},{type:'field_number',name:'ANGLE',value:0,min:rigProfile?-180:isOpenManipulator||isSO101?-180:-90,max:rigProfile?.joints?Math.max(...jointLimits.map(([, max]) => max)):isOpenManipulator||isSO101?180:90},{type:'field_number',name:'TIME',value:1,min:.1,max:10}],previousStatement:null,nextStatement:null,colour:'#569DE0',tooltip:'这是角度运动预览，实际关节需标定'},
{type:'grip',message0:'夹爪 %1',args0:[{type:'field_dropdown',name:'STATE',options:[['闭合','close'],['张开','open']]}],previousStatement:null,nextStatement:null,colour:'#9B79D5'},
{type:'wait',message0:'等待 %1 秒',args0:[{type:'field_number',name:'TIME',value:1,min:.1,max:10}],previousStatement:null,nextStatement:null,colour:'#E9AC36'},
{type:'repeat',message0:'重复 %1 次',args0:[{type:'field_number',name:'COUNT',value:2,min:1,max:10,precision:1}],message1:'%1',args1:[{type:'input_statement',name:'DO'}],previousStatement:null,nextStatement:null,colour:'#E9AC36'},
{type:'near',message0:'如果 虚拟前方距离 < %1 cm',args0:[{type:'field_number',name:'DIST',value:20,min:1,max:100}],message1:'%1',args1:[{type:'input_statement',name:'DO'}],previousStatement:null,nextStatement:null,colour:'#50AD9C',tooltip:'演示场景的距离固定为15cm，不代表真实传感器'}]);
if (rigProfile) {
  B.defineBlocksWithJsonArray([{
    type: 'pose', message0: '姿态 %1  用时 %2 秒',
    args0: [
      {type: 'field_dropdown', name: 'POSE', options: Object.entries(rigProfile.poses).map(([id, pose]) => [pose.label, id])},
      {type: 'field_number', name: 'TIME', value: 1, min: .1, max: 10},
    ],
    previousStatement: null, nextStatement: null, colour: '#569DE0',
  }]);
}
if (isMicroduck) B.defineBlocksWithJsonArray([{
  type: 'walk_skill',
  message0: '向前走 %1 厘米',
  args0: [{type: 'field_number', name: 'DISTANCE', value: 50, min: 20, max: 100, precision: 1}],
  message1: '如果摔倒 %1',
  args1: [{type: 'field_dropdown', name: 'RECOVER', options: [['起身并继续', 'recover'], ['停止', 'stop']]}],
  previousStatement: null,
  nextStatement: null,
  colour: '#208979',
  tooltip: '使用工作台已保存的步态。起身后继续走剩余距离。',
}]);
if (isMicroduck) B.defineBlocksWithJsonArray([
  {type:'route', message0:'路线任务 · 摔倒就 %1', args0:[{type:'field_dropdown', name:'FALL', options:[['停止','stop'],['起身并站稳','recover']]}], message1:'%1',
    args1:[{type:'input_statement', name:'DO'}], previousStatement:null, nextStatement:null, colour:'#c48427'},
  {type:'travel', message0:'沿当前朝向走 %1 厘米',
    args0:[{type:'field_number', name:'DISTANCE', value:10, min:10, max:100, precision:1}],
    previousStatement:null, nextStatement:null, colour:'#208979'},
  {type:'turn', message0:'原地向 %1 转 %2 °',
    args0:[{type:'field_dropdown', name:'DIRECTION', options:[['左','left'],['右','right']]},
      {type:'field_number', name:'ANGLE', value:90, min:15, max:180, precision:1}],
    previousStatement:null, nextStatement:null, colour:'#5279bb'},
  {type:'gaze', message0:'看向 %1  等待 %2 秒',
    args0:[{type:'field_dropdown', name:'GAZE', options:[['左上方','up_left'],['正前方','front'],['右下方','down_right']]},
      {type:'field_number', name:'TIME', value:1, min:.1, max:10}],
    previousStatement:null, nextStatement:null, colour:'#7668b8'},
  {type:'stationary', message0:'调用原地动作 %1',
    args0:[{type:'field_input',name:'SKILL',text:''}],
    previousStatement:null, nextStatement:null, colour:'#ab5597'},
  {type:'standup', message0:'起身并站稳 · %1',
    args0:[{type:'field_dropdown', name:'POSITION', options:[['趴倒','prone'],['仰倒','supine'],['侧倒','side']]}],
    previousStatement:null, nextStatement:null, colour:'#7668b8',
    tooltip:'作为第一步时，从选中的倒地姿态开始仿真。'},
]);
const rigToolbox = rigProfile && [
  ...(isMicroduck ? [{kind:'category', name:'路线', colour:'#208979', contents:
    [...['route','travel','turn','gaze','standup','wait'].map(type => ({kind:'block',type})),
      {kind:'block', type:'pose', fields:{POSE:'open'}}]}] : []),
  {kind: 'category', name: '动作', colour: '#569DE0', contents: [
    {kind: 'block', type: 'pose'},
    ...(isMicroduck ? [{kind: 'block', type: 'stationary'}] : []),
    ...(isMicroduck ? [{kind: 'block', type: 'walk_skill'}] : []),
    ...(rigProfile.joints ? [{kind: 'block', type: 'move'}] : []),
  ]},
  {kind: 'category', name: '控制', colour: '#E9AC36', contents: [
    {kind: 'block', type: 'wait'}, {kind: 'block', type: 'repeat'},
  ]},
];
export const workspace=B.inject('blockly',{renderer:'zelos',toolbox:{kind:'categoryToolbox',contents:rigToolbox||[{kind:'category',name:'运动',colour:'#569DE0',contents:[{kind:'block',type:'move'}]},{kind:'category',name:'工具',colour:'#9B79D5',contents:[{kind:'block',type:'grip'}]},{kind:'category',name:'控制',colour:'#E9AC36',contents:[{kind:'block',type:'wait'},{kind:'block',type:'repeat'},{kind:'block',type:'near'}]}]},grid:{spacing:20,length:1,colour:'#dce6e2',snap:true},zoom:{controls:true,wheel:true,startScale:.85,maxScale:1.4,minScale:.4},trashcan:true,move:{scrollbars:true,drag:true,wheel:true},sounds:false,media:'./vendor/media/'});
let suppress=false,listener=()=>{};
function chain(first){let out=[];for(let b=first;b;b=b.getNextBlock()){const n={type:b.type,id:b.id};if(n.type==='move')Object.assign(n,{joint:+b.getFieldValue('JOINT'),angle:+b.getFieldValue('ANGLE'),time:+b.getFieldValue('TIME')});if(n.type==='pose')Object.assign(n,{name:b.getFieldValue('POSE'),time:+b.getFieldValue('TIME')});if(n.type==='grip')n.state=b.getFieldValue('STATE');if(n.type==='wait')n.time=+b.getFieldValue('TIME');if(n.type==='repeat'||n.type==='near'){n[n.type==='repeat'?'count':'dist']=+b.getFieldValue(n.type==='repeat'?'COUNT':'DIST');n.body=chain(b.getInputTargetBlock('DO'))}if((rigProfile||isOpenManipulator||isSO101)&&n.type==='move')validateMove(n);
    if(rigProfile&&['grip','near'].includes(n.type))throw Error('当前设备不支持这个积木');
    if(n.type==='pose'&&(!rigProfile||!Object.hasOwn(rigProfile.poses,n.name)))throw Error('当前设备不支持这个姿态');
    if(n.type==='walk_skill') {
      if(!isMicroduck) throw Error('当前设备不支持步态技能');
      Object.assign(n,{distance:Number(b.getFieldValue('DISTANCE')),recover:b.getFieldValue('RECOVER')==='recover'});
      validateWalk(n);
    }
    if(n.type==='travel') n.distance=Number(b.getFieldValue('DISTANCE'));
    if(n.type==='turn') Object.assign(n,{direction:b.getFieldValue('DIRECTION'),angle:Number(b.getFieldValue('ANGLE'))});
    if(n.type==='gaze') Object.assign(n,{direction:b.getFieldValue('GAZE'),time:Number(b.getFieldValue('TIME'))});
    if(n.type==='stationary') n.name=b.getFieldValue('SKILL').trim();
    if(n.type==='standup') n.position=b.getFieldValue('POSITION');
    if(n.type==='route') Object.assign(n,{body:chain(b.getInputTargetBlock('DO')),fall:b.getFieldValue('FALL')||'stop'});
    if(isRouteAction(n)) validateRouteAction(n);
    out.push(n)}return out}
export function getProgram(){const tops=workspace.getTopBlocks(true),roots=tops.filter(b=>b.type==='start');if(roots.length!==1)throw Error('请保留一个“当运行时”起始积木');if(tops.length>1)throw Error('有未连接的积木，请连接到程序后再运行');return chain(roots[0].getNextBlock())}
export function toCode(nodes,indent=0){const p='    '.repeat(indent);return nodes.map(n=>n.type==='route'?`${p}with robot.${n.fall==='recover'?'recover_on_fall':'stop_on_fall'}():\n${toCode(n.body,indent+1)}`:n.type==='travel'?`${p}robot.walk(${n.distance})`:n.type==='turn'?`${p}robot.turn("${n.direction}", ${n.angle})`:n.type==='gaze'?`${p}robot.look("${n.direction}", ${n.time})`:n.type==='stationary'?`${p}robot.stationary(${JSON.stringify(n.name)})`:n.type==='standup'?`${p}robot.stand_up("${n.position}")`:n.type==='walk_skill'?`${p}robot.walk_forward(${n.distance}, recover_on_fall=${n.recover?'True':'False'})`:n.type==='move'?`${p}robot.move(${n.joint}, ${n.angle}, ${n.time})`:n.type==='pose'?`${p}robot.pose("${n.name}", ${n.time})`:n.type==='grip'?`${p}robot.grip("${n.state}")`:n.type==='wait'?`${p}robot.wait(${n.time})`:n.type==='repeat'?`${p}for i in range(${n.count}):\n${toCode(n.body,indent+1)||p+'    pass'}`:`${p}if robot.distance() < ${n.dist}:\n${toCode(n.body,indent+1)||p+'    pass'}`).join('\n')}
export function setProgram(nodes){suppress=true;workspace.clear();let start=workspace.newBlock('start');start.initSvg();start.render();start.moveBy(32,28);function fill(list,parent,input){let conn=input?parent.getInput('DO').connection:parent.nextConnection;for(const n of list){const b=workspace.newBlock(n.type);for(const [f,v] of Object.entries(n.type==='move'?{JOINT:n.joint,ANGLE:n.angle,TIME:n.time}:n.type==='pose'?{POSE:n.name,TIME:n.time}:n.type==='grip'?{STATE:n.state}:n.type==='walk_skill'?{DISTANCE:n.distance,RECOVER:n.recover?'recover':'stop'}:n.type==='travel'?{DISTANCE:n.distance}:n.type==='turn'?{DIRECTION:n.direction,ANGLE:n.angle}:n.type==='gaze'?{GAZE:n.direction,TIME:n.time}:n.type==='stationary'?{SKILL:n.name}:n.type==='standup'?{POSITION:n.position}:n.type==='route'?{FALL:n.fall||'stop'}:n.type==='wait'?{TIME:n.time}:n.type==='repeat'?{COUNT:n.count}:{DIST:n.dist}))b.setFieldValue(String(v),f);b.initSvg();b.render();conn.connect(b.previousConnection);if(n.body)fill(n.body,b,true);conn=b.nextConnection;}}fill(nodes,start);suppress=false;sync();}
export function sync(){try{const p=getProgram();$('code').value=(p.some(action => action.type === 'walk_skill' || isRouteAction(action)) ? '# 教学动作接口 · 调用已保存的 MuJoCo 步态\n' : '# 教学动作接口 · 仅在本页运动预览中运行\n')+toCode(p);$('block-count').textContent=workspace.getAllBlocks(false).length+' 个积木';$('program-state').textContent='积木和代码保持同步';localStorage.setItem(storageKey,JSON.stringify({version:1,prompt:$('prompt').value,workspace:B.serialization.workspaces.save(workspace)}));}catch(e){$('program-state').textContent=e.message}listener();}
export function onChange(fn){listener=fn}workspace.addChangeListener(e=>{if(!suppress&&!e.isUiEvent)sync()});
export function parseCode(code){const lines=code.split('\n').map((s,i)=>({s:s.trim(),indent:s.search(/\S/),line:i+1})).filter(x=>x.s&&!x.s.startsWith('#'));let index=0;function parse(depth){const out=[];while(index<lines.length){let l=lines[index];if(l.indent<depth)break;if(l.indent!==depth)throw Error(`第${l.line}行缩进应为${depth}个空格`);index++;let m,n;if(l.s==='pass')continue;if(m=l.s.match(/^robot\.move\((\d+),\s*(-?\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)$/)){n={type:'move',joint:+m[1],angle:+m[2],time:+m[3]};validateMove(n)}else if(rigProfile&&(m=l.s.match(/^robot\.pose\(["']([a-z]+)["'],\s*(\d+(?:\.\d+)?)\)$/))){
    n={type:'pose',name:m[1],time:+m[2]};
    if(!Object.hasOwn(rigProfile.poses,n.name)||n.time<.1||n.time>10)throw Error('姿态无效或用时不在0.1–10秒内');
  }else if(isMicroduck&&(m=l.s.match(/^robot\.walk_forward\((\d+),\s*recover_on_fall\s*=\s*(True|False)\)$/))){
    n={type:'walk_skill',distance:Number(m[1]),recover:m[2]==='True'};
    validateWalk(n);
  }else if(isMicroduck && (l.s==='with robot.stop_on_fall():' || l.s==='with robot.recover_on_fall():')){
    n={type:'route',fall:l.s.includes('recover_on_fall')?'recover':'stop',body:parse(depth+4)}; validateRouteAction(n);
  }else if(isMicroduck && (m=l.s.match(/^robot\.walk\((\d+)\)$/))){
    n={type:'travel',distance:Number(m[1])}; validateRouteAction(n);
  }else if(isMicroduck && (m=l.s.match(/^robot\.turn\(["'](left|right)["'],\s*(\d+)\)$/))){
    n={type:'turn',direction:m[1],angle:Number(m[2])}; validateRouteAction(n);
  }else if(isMicroduck && (m=l.s.match(/^robot\.look\(["'](up_left|front|down_right)["'],\s*(\d+(?:\.\d+)?)\)$/))){
    n={type:'gaze',direction:m[1],time:Number(m[2])}; validateRouteAction(n);
  }else if(isMicroduck && (m=l.s.match(/^robot\.stationary\(["']([\p{L}\p{N} _-]{1,24})["']\)$/u))){
    n={type:'stationary',name:m[1]}; validateRouteAction(n);
  }else if(isMicroduck && (m=l.s.match(/^robot\.stand_up\(["'](prone|supine|side)["']\)$/))){
    n={type:'standup',position:m[1]}; validateRouteAction(n);
  }else if(!rigProfile&&(m=l.s.match(/^robot\.grip\(["'](open|close)["']\)$/)))n={type:'grip',state:m[1]};else if(m=l.s.match(/^robot\.wait\((\d+(?:\.\d+)?)\)$/)){n={type:'wait',time:+m[1]};if(n.time<.1||n.time>10)throw Error('等待须在0.1–10秒内')}else if(m=l.s.match(/^for \w+ in range\((\d+)\):$/)){n={type:'repeat',count:+m[1],body:parse(depth+4)};if(n.count<1||n.count>10)throw Error('循环次数须在1–10内')}else if(!rigProfile&&(m=l.s.match(/^if robot\.distance\(\) < (\d+(?:\.\d+)?):$/))){n={type:'near',dist:+m[1],body:parse(depth+4)};if(n.dist<1||n.dist>100)throw Error('距离须在1–100cm内')}else throw Error(`第${l.line}行不在支持的教学语法范围内`);if(n.body&&!n.body.length)throw Error('循环或条件内至少需要一个动作');out.push(n)}return out}const p=parse(0);if(!p.length)throw Error('请输入至少一个动作');return p}
const move=(joint,angle,time=1)=>({type:'move',joint,angle,time});
const resetMoves = () => jointOptions.map((_, index) => move(index + 1, 0));
function validateWalk({distance, recover}) {
  if (!Number.isInteger(distance) || distance < 20 || distance > 100 || typeof recover !== 'boolean') {
    throw Error('向前走技能支持 20–100 厘米的整数距离');
  }
}

export function isRouteAction(action) {
  return ['route', 'travel', 'turn', 'gaze', 'standup', 'stationary'].includes(action.type);
}

export function isRouteStep(action) {
  if (['travel', 'turn', 'gaze', 'standup', 'stationary', 'wait'].includes(action.type)) return true;
  return action.type === 'pose' && ['open', 'close', 'look'].includes(action.name);
}

function validateRouteAction(action) {
  if (!isMicroduck) throw Error('当前设备不支持路线积木');
  if (action.type === 'travel' && (!Number.isInteger(action.distance) || action.distance < 10 || action.distance > 100)) {
    throw Error('路线步行支持 10–100 厘米的整数距离');
  }
  if (action.type === 'turn' && (!['left', 'right'].includes(action.direction) ||
      !Number.isInteger(action.angle) || action.angle < 15 || action.angle > 180)) {
    throw Error('转向支持向左或向右 15–180 度的整数角度');
  }
  if (action.type === 'gaze' && (!['up_left', 'front', 'down_right'].includes(action.direction) ||
      !Number.isFinite(action.time) || action.time < .1 || action.time > 10)) {
    throw Error('请选择视线方向，并设置 0.1–10 秒的观察时间');
  }
  if (action.type === 'stationary' && !/^[\p{L}\p{N} _-]{1,24}$/u.test(action.name)) {
    throw Error('请填写已发布的原地动作名称');
  }
  if (action.type === 'standup' && !['prone', 'supine', 'side'].includes(action.position)) throw Error('请选择倒地姿态');
  if (action.type === 'route' && action.fall !== undefined && !['stop','recover'].includes(action.fall)) throw Error('请选择摔倒处理方式');
  if (action.type === 'route' && (!action.body.length || action.body.length > 8 ||
      action.body.some(item => !isRouteStep(item)))) {
    throw Error('每条路线支持 1–8 个走路、转向、原地动作、张嘴、闭嘴、看向、起身或等待积木');
  }
}

const routeWalk = /^(?:(?:往前|向前|朝前)\s*)?(?:走|前进)\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十百]+)\s*(厘米|公分|cm|米|m)$/i;
const routeTurn = /^(?:原地\s*)?(?:向|往|朝)?\s*([左右])\s*(?:转弯|转身|旋转|转)\s*(?:(\d+|[一二两三四五六七八九十百]+)\s*(?:度|°))?$/;
const routeStop = /^(?:如果|要是)?(?:它|机器鸭)?(?:摔倒|跌倒)(?:了)?(?:后|就|时)?(?:停止|停下|结束)(?:任务)?$/;

const routeRecovery = /^(?:如果|要是)?(?:它|机器鸭)?(?:摔倒|跌倒)(?:了)?(?:后|就|时)?(?:自己|自动)?(?:起身|站起(?:来)?|爬起来)(?:并站稳|站稳)?$/;

function generateRoute(text) {
  const clauses = text.trim().replace(/[。！!]+$/, '').split(/[，,、；;]/)
    .map(clause => clause.trim().replace(/^(?:然后|接着|再)\s*/, ''));
  if (clauses.length > 1 && /^(?:结束|结束任务|完成任务)$/.test(clauses.at(-1))) clauses.pop();
  clauses[0] = clauses[0].replace(/^(?:请\s*)?(?:让\s*)?(?:机器鸭|Microduck|它)?\s*/i, '');
  const recover = clauses.length > 1 && routeRecovery.test(clauses.at(-1));
  if (recover || (clauses.length > 1 && routeStop.test(clauses.at(-1)))) clauses.pop();
  const steps = clauses.flatMap(clause => {
    const skill = stationaryNames.find(name =>
      clause === name || ['调用', '执行', '跳', '跳一段'].some(verb =>
        clause === verb + name || clause === verb + '「' + name + '」'));
    if (skill) return {type:'stationary', name:skill};
    if (/^(?:走完|走)\s*[Ll]\s*形路线$/.test(clause)) {
      return [{type:'travel',distance:10}, {type:'turn',direction:'left',angle:90}, {type:'travel',distance:10}];
    }
    const turn = clause.match(routeTurn);
    if (turn) return {type:'turn', direction:turn[1] === '左' ? 'left' : 'right', angle:turn[2] ? quantityFor(turn[2]) : 90};
    const walk = clause.match(routeWalk);
    if (walk) return {type:'travel', distance:distanceFor(walk[1], walk[2])};
    if (/^(?:张嘴|张开(?:鸭)?嘴|打开(?:鸭)?嘴)$/.test(clause)) return {type:'pose',name:'open',time:.6};
    if (/^(?:闭嘴|合上(?:鸭)?嘴|闭合(?:鸭)?嘴)$/.test(clause)) return {type:'pose',name:'close',time:.6};
    if (/^(?:转头|看看旁边)$/.test(clause)) return {type:'pose',name:'look',time:1};
    const gaze = clause.match(/^(?:看向|看|朝向|对准)\s*(左上方|正前方|右下方)$/);
    if (gaze) return {type:'gaze',direction:{左上方:'up_left',正前方:'front',右下方:'down_right'}[gaze[1]],time:1};
    const standup = clause.match(/^(?:从)?(?:(趴倒|仰倒|侧倒|摔倒)(?:状态)?(?:后)?)?(?:起身|站起(?:来)?|爬起来)(?:并站稳)?$/);
    if (standup) return {type:'standup',position:{仰倒:'supine',侧倒:'side'}[standup[1]] || 'prone'};
    const wait = clause.match(/^等待\s*(\d+(?:\.\d+)?)\s*秒$/);
    if (wait && Number(wait[1]) >= .1 && Number(wait[1]) <= 10) return {type:'wait',time:Number(wait[1])};
    return null;
  });
  if (steps.some(step => !step)) {
    if (steps.some(step => ['turn', 'gaze', 'standup', 'stationary'].includes(step?.type)) ||
        steps.filter(step => step?.type === 'travel').length > 1) throw Error('路线可填写走路、转向、已发布的原地动作、张嘴、闭嘴、看向左上方／正前方／右下方、起身、等待，并选择摔倒后停止或起身');
    return null;
  }
  if (!steps.some(step => isRouteAction(step))) return null;
  const [first] = steps;
  if (!recover && steps.length === 1 && first.type === 'travel' && first.distance >= 20) return null;
  steps.forEach(validateRouteAction);
  const route = {type:'route', fall:recover?'recover':'stop', body:steps};
  validateRouteAction(route);
  return [route];
}

function generateWalk(text) {
  const command = text.trim().replace(/[。！!]+$/, '').match(
    /^(?:请)?(?:让)?(?:机器鸭|Microduck|它)?\s*(?:向前|往前|朝前)\s*(?:走|前进)\s*(\d+(?:\.\d+)?|[一二两三四五六七八九十百]+)\s*(厘米|公分|cm|米|m)\s*(.*)$/i);
  if (!command) return null;
  const [, amount, unit, rawTail] = command;
  const tail = rawTail.replace(/[\s，,。；;]/g, '');
  const recover = /^(?:如果|要是)?(?:它|机器鸭)?(?:摔倒|跌倒)(?:了)?(?:后|就|时)?(?:自己|自动)?(?:爬起来|站起来|起身|站起)(?:(?:再|然后)?(?:继续走完|继续走|走完|走)(?:剩下的距离|剩余的?距离|到终点)?)?$/.test(tail);
  const stop = /^(?:如果|要是)?(?:它|机器鸭)?(?:摔倒|跌倒)(?:了)?(?:后|就|时)?(?:停止|停下|结束)$/.test(tail);
  if (tail && !recover && !stop) throw Error('请在距离后填写「摔倒就停止」或「摔倒后爬起来，再走完剩下的距离」');
  const action = {type: 'walk_skill', distance: distanceFor(amount, unit), recover};
  validateWalk(action);
  return [action];
}
function quantityFor(amount) {
  const quantity = Number(amount);
  if (!Number.isNaN(quantity)) return quantity;
  const digits = '一二三四五六七八九';
  const digit = token => token === '两' ? 2 : token ? digits.indexOf(token) + 1 : 0;
  const tens = amount.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
  if (amount === '一百') return 100;
  if (tens) return (tens[1] ? digit(tens[1]) : 1) * 10 + digit(tens[2]);
  return amount.length === 1 ? digit(amount) : NaN;
}

function distanceFor(amount, unit) {
  const measured = quantityFor(amount) * (/^(米|m)$/i.test(unit) ? 100 : 1);
  return Math.abs(measured - Math.round(measured)) < 1e-9 ? Math.round(measured) : measured;
}

export function generateTask(s){
if (isMicroduck) {
  const walk = generateRoute(s) || generateWalk(s);
  if (walk) return walk;
}
if (rigProfile) return parseCode(toCode(generateRigTask(rigProfile, s)));
if (isOpenManipulator || isSO101) {
  const task = s.trim().replace(/[。！!]+$/, '');
  if (isSO101 && task === '五轴与夹爪演示') {
    return [move(1, 25), move(2, -22), move(3, 30), move(4, 20), move(5, 35),
      {type: 'grip', state: 'close'}, {type: 'wait', time: .8}, {type: 'grip', state: 'open'}];
  }
  if (isOpenManipulator && task === '四轴与夹爪演示') {
    return [move(1, 25), move(2, 22), move(3, -35), move(4, 28),
      {type: 'grip', state: 'close'}, {type: 'wait', time: .8}, {type: 'grip', state: 'open'}];
  }
  const command = task.match(/^(?:请)?(?:让)?\s*J([1-5])\s*(?:转动|旋转|转|移动)?\s*(?:到|至)?\s*(-?\d+(?:\.\d+)?)\s*(?:度|°)$/i);
  if (command) {
    const action = move(+command[1], +command[2]);
    validateMove(action);
    return [action];
  }
}
const clean=s.trim().replace(/[。！!]/g,'');
const direct=clean.match(/^(?:请)?(?:(张开|打开|闭合|关闭)夹爪|夹爪(张开|打开|闭合|关闭))$/);
if(direct)return [{type:'grip',state:/张开|打开/.test(direct[1]||direct[2])?'open':'close'}];
if(clean==='夹爪开合演示')return [{type:'grip',state:'open'},{type:'wait',time:1},{type:'grip',state:'close'},{type:'wait',time:1},{type:'grip',state:'open'}];
if(!s.trim())throw Error('先写下你希望机器人完成的任务');let p=[];const wait=s.match(/等待\s*(\d+(?:\.\d+)?)\s*秒/),repeat=s.match(/重复\s*([一二三四五六七八九十两]|\d+)\s*次/);if(/抓|夹|搬|积木/.test(s))p=[{type:'grip',state:'open'},move(1,-25),move(2,25),{type:'grip',state:'close'},move(2,0),move(1,/左侧|左边/.test(s)?-45:45),move(2,25),{type:'grip',state:'open'},move(2,0)];else if(/左|右|转/.test(s)){for(const dir of ['左','右'])if(s.includes(dir)){const m=s.match(new RegExp(dir+'(?:边|侧|转|旋转|转动|向|\\s)*([0-9]+(?:\\.[0-9]+)?)'));const angle=m?+m[1]:40;if(angle>90)throw Error('演示转角范围为0–90度');p.push(move(1,dir==='左'?-angle:angle));}}else if(/抬|升/.test(s))p=[move(2,-25)];else if(/回|初始|复位/.test(s))p=[...resetMoves()];else if(!wait)throw Error('当前本地演示支持抓取、左右转动、抬起、等待和复位；请使用示例或接入你的AI服务');if(wait){const t=+wait[1];if(t<.1||t>10)throw Error('演示等待时间为0.1–10秒');p.push({type:'wait',time:t})}if(repeat){const cn={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};const count=cn[repeat[1]]||+repeat[1];if(count<1||count>10)throw Error('演示循环支持1–10次');p=[{type:'repeat',count,body:p}]}if(/回到|最后复位/.test(s))p.push(...resetMoves());return p}
export function flatten(p){let out=[];for(const n of p){if(n.type==='repeat')for(let i=0;i<n.count;i++)out.push(...flatten(n.body));else if(n.type==='near'){if(15<n.dist)out.push(...flatten(n.body))}else out.push(n);if(out.length>500)throw Error('动作超过500步，请减少嵌套循环')}return out}
export function restore(){try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.workspace){suppress=true;B.serialization.workspaces.load(saved.workspace,workspace);suppress=false;$('prompt').value=saved.prompt||'';sync();return true}}catch{suppress=false}return false}
