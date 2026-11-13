const go2Standing = [0, 48, -90, 0, 48, -90, 0, 48, -90, 0, 48, -90];

const fr3Home = [0, -45, 0, -135, 0, 90, 45];

const microduckStand = [
  0, -0.08726646259971647, -0.457924, -0.004940, 0.452984,
  0.3490658503988659, 0.3490658503988659, 0, 0,
  0, 0.08726646259971647, 0.457924, 0.004940, -0.452984, 0,
].map(radians => radians * 180 / Math.PI);
const op3Legs = ['l', 'r'].flatMap(side => ['hip_yaw', 'hip_roll', 'hip_pitch', 'knee', 'ank_pitch', 'ank_roll'].map(joint => side + '_' + joint));
const op3Arms = ['l', 'r'].flatMap(side => ['sho_pitch', 'sho_roll', 'el'].map(joint => side + '_' + joint));
const op3Home = [...Array(12).fill(0), 0, 68, 0, 0, -68, 0, 0, 0];
const op3Wave = [...op3Home.slice(0, 15), -24, 50, -55, -12, 0];
const spiderLegs = ['fl', 'fr', 'rl', 'rr'];
const spiderHome = Array(8).fill(0);
const octoHome = Array(24).fill(0);
const octoRaised = group => octoHome.map((value, index) => index % 3 === 1 && group.includes(Math.floor(index / 3)) ? 15 : value);

function transformProfile(badge, source, joints, limits, poses) {
  return {badge, source, joints, limits, poses, home:'fold', frameModel:true, transform:true};
}

export const rigProfiles = {
  jetrover: {
    badge: 'JetRover · 关节运动预览',
    source: 'Hiwonder JetRover · 麦克纳姆轮版',
    home: 'home',
    frameModel: true,
    telemetry: [0, 1, 5],
    articulation: {
      file: 'jetrover.urdf', root: 'base_footprint', visuals: 'urdf',
      jointNames: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'r_joint'],
      groundMeshes: ['wheel_left_front_link', 'wheel_left_back_link', 'wheel_right_front_link', 'wheel_right_back_link'],
    },
    joints: ['底座', '肩部', '肘部', '腕部俯仰', '腕部旋转', '夹爪'],
    limits: [[-119,119],[-119,119],[-119,119],[-119,119],[-119,119],[-25,25]],
    poses: {
      home: {label:'复位', aliases:['复位'], angles:[0,0,0,0,0,0]},
      open: {label:'张开夹爪', aliases:['张开夹爪','打开夹爪'], joint:6, angle:20},
      close: {label:'合上夹爪', aliases:['合上夹爪','闭合夹爪'], joint:6, angle:0},
    },
  },
  'greg06-ball': transformProfile('Greg06 · 教学结构示意','Greg06 原型参考 · 自建示意几何',
    ['球壳','机身展开','第一条腿'], [[0,75],[0,65],[0,28]], {
      fold:{label:'收成球',aliases:['收成球','收拢','复位'],angles:[0,0,0]},
      unfold:{label:'展开四足',aliases:['展开四足','展开'],angles:[66,65,0]},
      lift:{label:'抬左前腿',aliases:['抬左前腿'],angles:[66,65,24]},
    }),
  'zgps-ball': transformProfile('ZGPS_01 · CAD 收展示意','ZGPS-666 · SolidWorks 转换件',
    ['展开幅度','球壳翻转'], [[0,90],[0,70]], {
      fold:{label:'收成球',aliases:['收成球','收拢','复位'],angles:[0,0]},
      unfold:{label:'展开六足',aliases:['展开六足','展开'],angles:[70,42]},
      shell:{label:'打开球壳',aliases:['打开球壳'],angles:[70,65]},
    }),
  morphoball: transformProfile('MorphoBall · STEP 收展示意','TZY-H · 原版 STEP 分件',
    ['双轮伸缩','摆臂'], [[0,90],[0,25]], {
      fold:{label:'收成球',aliases:['收成球','收拢','复位'],angles:[0,0]},
      unfold:{label:'展开双轮',aliases:['展开双轮','展开'],angles:[70,0]},
      swing:{label:'摆动外壳',aliases:['摆动外壳'],angles:[70,20]},
    }),
  op3: {
    badge: 'OP3 · 20 关节运动学预览',
    source: 'ROBOTIS · 官方 URDF 与 STL',
    home: 'stand',
    frameModel: true,
    telemetry: [15, 16, 17],
    articulation: {
      file: 'robotis_op3.urdf', root: 'body_link', visuals: 'urdf',
      groundMeshes: ['l_ank_roll_link', 'r_ank_roll_link'],
      jointNames: [...op3Legs, ...op3Arms, 'head_pan', 'head_tilt'],
    },
    joints: [
      ...['左', '右'].flatMap(side => ['髋旋转','髋侧摆','髋俯仰','膝','踝俯仰','踝侧摆'].map(joint => side + joint)),
      ...['左', '右'].flatMap(side => ['肩俯仰','肩侧摆','肘'].map(joint => side + joint)), '头部转向', '头部俯仰',
    ],
    limits: Array.from({length: 20}, () => [-162, 162]),
    poses: {
      stand: {label: '站立', aliases: ['站立', '复位'], angles: op3Home},
      wave: {label: '抬手打招呼', aliases: ['挥手', '抬手打招呼'], angles: op3Wave},
      left: {label: '向左看', aliases: ['向左看'], joint: 19, angle: 32},
      right: {label: '向右看', aliases: ['向右看'], joint: 19, angle: -32},
    },
  },
  spiderbot: {
    badge: 'SpiderBot · 8 关节运动学预览',
    source: '四足 ESP32 开源项目 · 原始 URDF',
    home: 'stand',
    frameModel: true,
    telemetry: [0, 1],
    articulation: {
      file: 'spiderbot.urdf', root: 'base_link', visuals: 'urdf',
      groundMeshes: spiderLegs.map(leg => leg + '_foot'),
      jointNames: spiderLegs.flatMap(leg => [leg + '1_joint', leg + '2_joint']),
    },
    joints: ['左前','右前','左后','右后'].flatMap(leg => [leg + '腿旋转', leg + '腿抬起']),
    limits: Array.from({length: 8}, () => [-89.9, 89.9]),
    poses: {
      stand: {label: '站立', aliases: ['站立', '复位'], angles: spiderHome},
      crouch: {label: '蹲下', aliases: ['蹲下', '趴下'], angles: spiderHome.map((_, i) => i % 2 ? -44 : 0)},
      lift: {label: '抬左前腿', aliases: ['抬左前腿', '抬左前脚'], joint: 2, angle: -38},
    },
  },
  octobot: {
    badge: 'Octobot · 24 关节运动学预览',
    source: 'Deivid Negoita · 原版 GLB 与关节绑定',
    home: 'stand',
    frameModel: true,
    telemetry: [0, 1, 2],
    joints: Array.from({length: 8}, (_, i) => ['髋','肩','膝'].map(joint => '第 ' + (i + 1) + ' 腿 ' + joint)).flat(),
    limits: Array.from({length: 24}, (_, i) => i % 3 ? [-90, 90] : [-31.5, 31.5]),
    poses: {
      stand: {label: '站立', aliases: ['站立', '复位'], angles: octoHome},
      lift: {label: '抬第一条腿', aliases: ['抬第一条腿'], angles: octoRaised([0])},
      alternatea: {label: '抬第一组腿', aliases: ['抬第一组腿'], angles: octoRaised([0, 2, 4, 6])},
      alternateb: {label: '抬第二组腿', aliases: ['抬第二组腿'], angles: octoRaised([1, 3, 5, 7])},
    },
  },
  microduck: {
    title: 'Microduck',
    badge: 'Microduck · 双足与鸭嘴动作预览',
    source: 'Pollen Robotics · 官方 Microduck 模型',
    home: 'stand',
    articulation: {
      file: 'microduck.urdf',
      root: 'world',
      groundMeshes: ['ankle_left', 'ankle_right'],
      jointNames: [
        'left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle',
        'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll',
        'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle',
        'beak_opening',
      ],
    },
    joints: [
      '左髋旋转', '左髋侧摆', '左髋俯仰', '左膝', '左踝',
      '颈部俯仰', '头部俯仰', '头部转向', '头部侧倾',
      '右髋旋转', '右髋侧摆', '右髋俯仰', '右膝', '右踝', '鸭嘴',
    ],
    limits: [
      [-25, 30], [-22, 22], [-89.9, 89.9], [-89.9, 89.9], [-89.9, 89.9],
      [-90, 60], [-89.9, 89.9], [-169.9, 169.9], [-25, 25],
      [-30, 25], [-22, 22], [-89.9, 89.9], [-89.9, 89.9], [-89.9, 89.9], [0, 18.3],
    ],
    poses: {
      stand: {label: '站立', aliases: ['站立', '回到初始姿态', '复位'], angles: microduckStand},
      look: {label: '转头', aliases: ['转头', '看看旁边'], joint: 8, angle: 32},
      open: {label: '张开鸭嘴', aliases: ['张开鸭嘴', '张嘴'], joint: 15, angle: 18},
      close: {label: '合上鸭嘴', aliases: ['合上鸭嘴', '闭嘴'], joint: 15, angle: 0},
    },
  },
  fr3: {
    title: 'Franka FR3',
    badge: 'Franka FR3 · 七轴运动预览',
    source: 'Franka Robotics · SimReady FR3 v2.1',
    home: 'home',
    articulation: {
      file: 'fr3.urdf',
      root: 'fr3v2_1_link0',
      jointNames: Array.from({length: 7}, (_, index) => 'fr3v2_1_joint' + (index + 1)),
    },
    joints: ['底座', '肩部', '上臂', '肘部', '前臂', '腕部俯仰', '腕部旋转'],
    limits: [[-166.2, 166.2], [-105.2, 105.2], [-166.2, 166.2], [-176.3, -6.8],
      [-164.8, 164.8], [25.2, 264.8], [-174.7, 174.7]],
    poses: {
      home: {label: '回到初始姿态', aliases: ['回到初始姿态', '回初始姿态', '复位'], angles: fr3Home},
      sweep: {label: '侧转示范', aliases: ['侧转示范', '侧转'], angles: [32, -35, 12, -115, 0, 100, 45]},
    },
  },
  go2: {
    title: '宇树 Go2',
    badge: 'Go2 · 12 关节动作预览',
    source: 'Unitree Robotics · 官方 URDF 与模型',
    home: 'stand',
    articulation: {
      file: 'go2.urdf',
      root: 'base',
      feet: ['FL', 'FR', 'RL', 'RR'].map(leg => leg + '_foot'),
      jointNames: ['FL', 'FR', 'RL', 'RR'].flatMap(leg =>
        ['hip', 'thigh', 'calf'].map(part => leg + '_' + part + '_joint')),
    },
    joints: ['左前腿', '右前腿', '左后腿', '右后腿'].flatMap(leg =>
      ['髋关节', '大腿', '小腿'].map(joint => leg + ' ' + joint)),
    limits: [[-59, 59], [-90, 199], [-156, -48], [-59, 59], [-90, 199], [-156, -48],
      [-59, 59], [-28, 256], [-156, -48], [-59, 59], [-28, 256], [-156, -48]],
    poses: {
      stand: {label: '站立', aliases: ['站起来', '站立'], angles: go2Standing},
      crouch: {label: '蹲下', aliases: ['蹲下', '下蹲', '趴下'], angles: [0, 70, -135, 0, 70, -135, 0, 70, -135, 0, 70, -135]},
      paw: {label: '抬左前脚', aliases: ['抬起左前脚', '抬左前脚', '抬爪'], angles: [-8, 73, -126, ...go2Standing.slice(3)]},
    },
  },
  amazinghand: {
    title: 'AmazingHand',
    badge: 'AmazingHand · 右手动作预览',
    source: 'Pollen Robotics · 官方右手仿真模型',
    home: 'open',
    poses: {
      open: {label: '张开手掌', angles: [0, 0, 0, 0], aliases: ['张开手掌', '张开', '打开']},
      close: {label: '合拢手指', angles: [1, 1, 1, 1], aliases: ['合拢手指', '合拢', '握拳', '闭合']},
      index: {label: '单指弯曲', angles: [1, 0, 0, 0], aliases: ['单指弯曲', '弯曲食指', '弯曲一根手指']},
    },
  },
};

export function generateRigTask(profile, input) {
  const task = input.trim().replace(/^请(?:让)?\s*/, '');
  const parts = task.split(/[，,。；;、]|然后|再/).map(part => part.trim()).filter(Boolean);
  if (!parts.length) throw Error('请先输入动作，或选择下方示例');
  return parts.map(part => {
    const wait = part.match(/^等待\s*(\d+(?:\.\d+)?)\s*秒$/);
    if (wait) return {type: 'wait', time: Number(wait[1])};
    const joint = part.match(/^J(\d+)\s*(?:转动|转|移动)?\s*(?:到|至)?\s*(-?\d+(?:\.\d+)?)\s*(?:度|°)$/i);
    if (joint && profile.joints) return {type: 'move', joint: Number(joint[1]), angle: Number(joint[2]), time: 1};
    const pose = Object.entries(profile.poses).find(([, info]) => info.aliases.includes(part));
    if (!pose) throw Error('当前设备不支持「' + part + '」，请使用下方示例中的动作');
    return {type: 'pose', name: pose[0], time: 1};
  });
}
