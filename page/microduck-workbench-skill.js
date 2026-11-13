import {$, getProgram, flatten, isRouteAction, isRouteStep, workspace, log, toast, setStationarySkills} from './program.js';

const base = './api/training';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const cm = metres => (metres * 100).toFixed(1) + ' 厘米';

function routeActions(program) {
  const first = program[0];
  if (program.length === 1 && first.type === 'route') return first.body;
  if (program.some(isRouteAction) && program.every(isRouteStep)) return program;
  return null;
}

const gazeLabels = {up_left: '左上方', front: '正前方', down_right: '右下方'};
const poseLabels = {open: '张嘴', close: '闭嘴', look: '转头'};
const recoveryLabels = {prone: '趴倒', supine: '仰倒', side: '侧倒'};

function actionLabel(action) {
  if (action.type === 'stationary') return action.name;
  if (action.type === 'pose') return poseLabels[action.name];
  if (action.type === 'standup') return '起身并站稳（' + recoveryLabels[action.position] + '）';
  if (action.type === 'gaze') return '看向' + gazeLabels[action.direction];
  if (action.type === 'wait') return '等待 ' + action.time + ' 秒';
  if (action.type === 'turn') return (action.direction === 'left' ? '左转 ' : '右转 ') + action.angle + '°';
  return '向前走 ' + action.distance + ' 厘米';
}

function routeReading(frame, segment, action, resumedOrigin) {
  if (action.type === 'travel') {
    const [x, y] = resumedOrigin || segment.start;
    const distance = (frame[0] - x) * Math.cos(segment.heading) + (frame[1] - y) * Math.sin(segment.heading);
    return (distance * 100).toFixed(1) + ' / ' + action.distance + ' cm';
  }
  if (action.type === 'pose' && action.name !== 'look') {
    return ((frame[21] ?? 0) * 180 / Math.PI).toFixed(1) + '°';
  }
  if (action.type === 'gaze' || action.type === 'pose') {
    return frame.length >= 24 ? frame[22].toFixed(1) + '° / ' + frame[23].toFixed(1) + '°' : '—';
  }
  if (action.type === 'wait') return action.time + ' 秒';
  if (action.type === 'stationary') return segment.actual + ' / ' + segment.target + ' 阶段达标';
  if (action.type === 'standup') return '连续站稳 ' + segment.target + ' 秒';
  const [, , , w, x, y, z] = frame;
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  const delta = yaw - segment.heading;
  const direction = action.direction === 'left' ? 1 : -1;
  let angle = direction * Math.atan2(Math.sin(delta), Math.cos(delta)) * 180 / Math.PI;
  if (action.angle >= 135 && angle < -150) angle += 360;
  return angle.toFixed(1) + ' / ' + action.angle + '°';
}

async function request(path, options) {
  const response = await fetch(base + path, options);
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) throw Error('请用本地训练工作台运行这项技能。');
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'MuJoCo 服务暂时不可用。');
  return result;
}

export function createWalkSkill(scene) {
  let session = null;
  let animation = 0;
  const run = $('run');
  const stage = $('current-step');
  const progress = $('progress');
  const status = $('progress-text');

  let linkedSkill = new URLSearchParams(location.search).get('skill');
  async function refreshStationary() {
    const panel = $('stationary-skill-list');
    if (!panel) return;
    try {
      const {skills} = await request('/skill/stationary');
      setStationarySkills(skills);
      const choices = skills.map(({name}) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'outline';
        button.textContent = name;
        button.onclick = () => {
          $('prompt').value = '执行「' + name + '」';
          $('generate').click();
        };
        if (linkedSkill === name) {
          linkedSkill = null;
          queueMicrotask(() => button.click());
        }
        return button;
      });
      panel.querySelector('[data-skills]').replaceChildren(...choices);
      panel.hidden = !choices.length;
    } catch {
      panel.hidden = true;
    }
  }

  async function refreshSkill() {
    void refreshStationary();
    try {
      const {skill, short, turning} = await request('/skill');
      $('walk-profile').textContent = short && turning ? '短走与转向已就绪' :
        skill ? '已加载训练步态' : '等待保存训练步态';
    } catch {
      $('walk-profile').textContent = '步态服务未连接';
    }
  }

  function cancel(id) {
    if (id) void request('/' + id, {method: 'DELETE'}).catch(() => {});
  }

  function reset() {
    if (!session) return;
    const current = session;
    session = null;
    cancelAnimationFrame(animation);
    if (current.pending) cancel(current.id);
    scene.clearWalk();
    $('duck-joint-label').textContent = '头部转向 / 鸭嘴';
    $('duck-state-label').textContent = '鸭嘴状态';
    $('scene-status').textContent = current.sceneLabel;
    $('duck-scene-caption').textContent = '拖动旋转 · 滚轮缩放 · 右键平移';
    $('model-info').textContent = current.modelInfo;
    stage.textContent = '—';
  }

  function showEvent(current, event) {
    if (event.type === 'turn_retry') {
      $('grip-value').textContent = '转向补偿';
      log(event.time.toFixed(2) + ' 秒 · 已转 ' + event.angle.toFixed(1) + '°，调整转向步态');
      return;
    }
    if (current.route && event.type === 'segment') {
      current.activeIndex = event.segment;
      current.recovering = false;
      current.resumedOrigin = null;
      const action = current.route[event.segment];
      workspace.highlightBlock(action.id);
      stage.textContent = (event.segment + 1) + ' · ' + actionLabel(action);
      $('grip-value').textContent = action.type === 'turn' ? '转向' : action.type === 'travel' ? '行走' : action.type === 'standup' ? '正在起身' : '原地站立';
      const head = action.type === 'gaze' || (action.type === 'pose' && action.name === 'look');
      $('duck-joint-label').textContent = head ? '实测视线（左右 / 上下）' :
        action.type === 'pose' ? '鸭嘴开合角度' : action.type === 'wait' ? '等待时间' : action.type === 'stationary' ? '已通过阶段' : action.type === 'standup' ? '起身目标' : '实测 / 本步目标';
      log('步骤 ' + (event.segment + 1) + ' · ' + actionLabel(action));
      return;
    }
    if (current.route && ['recovery_start', 'recovery_missing', 'recovered', 'realign', 'resumed'].includes(event.type)) {
      const action = current.route[event.segment];
      const name = recoveryLabels[event.position];
      const labels = {
        recovery_start: '调用已保存的' + name + '起身技能',
        recovery_missing: '当前缺少已保存的' + name + '起身技能',
        recovered: '已连续站稳 ' + (event.stableSeconds?.toFixed(2) || '') + ' 秒',
        realign: '重新对准路线方向',
        resumed: '继续第 ' + (event.segment + 1) + ' 步 · ' + actionLabel(action),
      };
      const label = labels[event.type];
      stage.textContent = label;
      $('grip-value').textContent = event.type === 'recovered' ? '已起身' : event.type === 'resumed' ? '继续路线' : '起身恢复';
      current.recovering = event.type !== 'resumed';
      if (event.type === 'resumed') current.resumedOrigin = event.origin;
      log(event.time.toFixed(2) + ' 秒 · ' + label, event.type === 'recovery_missing');
      return;
    }
    const labels = {push: '施加测试推力', fall: '检测到摔倒', recovered: '已站稳，继续走'};
    stage.textContent = labels[event.type];
    if (event.type === 'fall') {
      if (current.route) current.recovering = current.fallMode === 'recover';
      $('grip-value').textContent = current.action?.recover || current.recovering ? '准备起身' : '摔倒';
    } else if (event.type === 'recovered') {
      $('grip-value').textContent = '已起身';
    }
    log(event.time.toFixed(2) + ' 秒 · ' + labels[event.type] + (current.route ? ' · 第 ' + (event.segment + 1) + ' 步' : ' · 前进 ' + cm(event.distance)));
  }

  function renderFrame(current, elapsed) {
    const {replay} = current;
    const frames = replay.poses;
    const frameIndex = elapsed >= Math.round(replay.seconds * 1000) ? frames.length - 1 :
      Math.max(0, Math.min(frames.length - 1, Math.floor(elapsed / replay.stepMs)));
    const frame = frames[frameIndex];
    while (current.eventIndex < replay.events.length && Math.round(replay.events[current.eventIndex].time * 1000) <= elapsed) {
      showEvent(current, replay.events[current.eventIndex++]);
    }
    if (frameIndex !== current.frame) {
      current.frame = frameIndex;
      scene.showWalkFrame(frame, frameIndex);
      if (current.route) {
        $('joint-value').textContent = current.recovering ? '—' :
          routeReading(frame, replay.segments[current.activeIndex], current.route[current.activeIndex], current.resumedOrigin);
        progress.style.width = (elapsed / Math.max(1, replay.seconds * 1000) * 100) + '%';
      } else {
        $('joint-value').textContent = (frame[0] * 100).toFixed(1) + ' / ' + current.action.distance;
        progress.style.width = Math.max(0, Math.min(100, frame[0] / replay.goal * 100)) + '%';
      }
    }
  }

  function play(current) {
    current.paused = false;
    status.textContent = 'MuJoCo 回放';
    run.textContent = 'Ⅱ 暂停';
    let last = performance.now();
    function tick(now) {
      if (session !== current || current.paused) return;
      const duration = Math.round(current.replay.seconds * 1000);
      current.elapsed = Math.min(duration, current.elapsed + Math.max(0, now - last) * Number($('speed').value));
      last = now;
      renderFrame(current, current.elapsed);
      if (current.elapsed < duration) {
        animation = requestAnimationFrame(tick);
        return;
      }
      const {replay} = current;
      current.finished = true;
      const outcomes = {fall: '摔倒后停止', recovery_timeout: '起身超时', recovery_missing: '缺少对应起身技能', recovery_heading: '起身后未能恢复路线方向', timeout: '动作超时', tolerance: '距离或转角未达标', motion_drift: '原地动作位移超限', motion_target: '原地动作未达标'};
      const outcome = replay.passed ? (current.route ? '路线完成' : '到达终点') : outcomes[replay.failure] || '任务未达标';
      status.textContent = outcome;
      stage.textContent = '执行结束';
      $('grip-value').textContent = replay.passed ? '站稳' : outcome;
      run.textContent = '▶ 再次运行';
      workspace.highlightBlock(null);
      if (current.route) {
        const measures = replay.segments.map((segment, index) => {
          if (segment.type === 'turn') return segment.actual.toFixed(1) + '°';
          if (segment.type === 'travel') return cm(segment.actual);
          if (segment.type === 'standup') return '站稳 ' + segment.actual.toFixed(2) + ' 秒';
          return actionLabel(current.route[index]);
        });
        log(outcome + ' · ' + measures.join(' → ') + (replay.recoveries ? ' · 起身 ' + replay.recoveries + ' 次' : ''), !replay.passed);
      } else {
        log(outcome + ' · 实际前进 ' + cm(replay.distance) + (replay.recoveries ? ' · 起身 ' + replay.recoveries + ' 次' : ''), !replay.passed);
      }
    }
    animation = requestAnimationFrame(tick);
  }

  async function simulate(current) {
    const action = current.action;
    try {
      let job = await request('', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(current.route ? {task: 'route_skill', actions: current.route, pushAt: current.pushAt, fallMode: current.fallMode} :
          {task: 'walking_skill', distance: action.distance, recover: action.recover, disturbance: current.disturbance}),
      });
      if (session !== current) {
        cancel(job.id);
        return;
      }
      current.id = job.id;
      while (session === current && job.status === 'running') {
        await delay(250);
        if (session !== current) return;
        job = await request('/' + current.id);
        status.textContent = job.queuePosition ? '仿真排队 · 第 ' + job.queuePosition + ' 位' : 'MuJoCo 计算中';
      }
      if (session !== current) return;
      if (job.status !== 'completed') throw Error(job.error || '这轮仿真已结束。');
      const replay = await request('/' + current.id + '/replays/final');
      if (session !== current) return;
      current.pending = false;
      current.replay = replay;
      if (current.route) scene.prepareRoute(replay.poses);
      else scene.prepareWalk(replay.goal, replay.poses);
      stage.textContent = current.route ? '路线开始' : '向前走';
      $('grip-value').textContent = '行走';
      renderFrame(current, 0);
      play(current);
    } catch (error) {
      if (session !== current) return;
      reset();
      workspace.highlightBlock(null);
      run.textContent = '▶ 运行仿真';
      status.textContent = '仿真未完成';
      toast(error.message);
      log(error.message, true);
      void refreshSkill();
    }
  }

  function refreshControls() {
    let route;
    try { route = routeActions(getProgram()); } catch { route = null; }
    const select = $('route-push-step');
    const disturbance = $('walk-disturbance');
    const options = route?.flatMap((action, index) => ['standup', 'stationary'].includes(action.type) ? [] :
      [new Option((index + 1) + ' · ' + actionLabel(action), index)]);
    disturbance.disabled = Boolean(route && !options.length);
    if (disturbance.disabled) disturbance.checked = false;
    $('route-push-control').hidden = !options?.length || !disturbance.checked;
    if (!options?.length) return;
    const previous = select.value;
    select.replaceChildren(...options);
    select.value = options.some(option => option.value === previous) ? previous : options[Math.min(1, options.length - 1)].value;
  }

  function handle(single = false) {
    if (session && !session.finished) {
      if (session.pending) throw Error('MuJoCo 正在计算，请稍候。');
      if (single) throw Error('步态积木是一个完整的仿真步骤，可用运行按钮暂停或继续。');
      if (session.paused) play(session);
      else {
        cancelAnimationFrame(animation);
        session.paused = true;
        run.textContent = '▶ 继续运行';
        status.textContent = '回放已暂停';
      }
      return true;
    }

    const program = getProgram();
    if (!flatten(program).some(action => action.type === 'walk_skill' || isRouteAction(action))) return false;
    const route = routeActions(program);
    if (!route && (program.length !== 1 || program[0].type !== 'walk_skill')) {
      throw Error('请把路线动作连在同一个「路线任务」积木里，或单独运行「向前走」积木。');
    }
    if (route?.length > 8) throw Error('路线最多支持 8 步。');
    if (!scene.state.ready) throw Error('模型仍在载入，请稍候。');
    reset();
    const action = program[0];
    const disturbance = $('walk-disturbance').checked;
    session = {action, route, fallMode: action.fall || 'stop', activeIndex: 0, pending: true, elapsed: 0, frame: -1, eventIndex: 0,
      disturbance, pushAt: route && disturbance ? Number($('route-push-step').value) : null, sceneLabel: $('scene-status').textContent,
      modelInfo: $('model-info').textContent};
    if (route) scene.prepareRoute([]);
    else scene.prepareWalk(action.distance / 100);
    $('scene-status').textContent = 'Microduck · MuJoCo 步态仿真';
    $('duck-scene-caption').textContent = route ? '绿线显示实际轨迹' : '橙线起点 · 绿线终点';
    $('model-info').textContent = '回放本次 MuJoCo 仿真记录的机身位置、姿态和关节运动。';
    $('duck-joint-label').textContent = route ? '实测 / 本步目标' : '前进 / 目标（厘米）';
    $('duck-state-label').textContent = '步态状态';
    $('joint-value').textContent = route ? '—' : '0.0 / ' + action.distance;
    $('grip-value').textContent = '准备';
    stage.textContent = '步态技能';
    status.textContent = 'MuJoCo 计算中';
    progress.style.width = '0%';
    run.textContent = '计算中…';
    workspace.highlightBlock(action.id);
    log((route ? '启动路线 · ' + route.length + ' 步' : '启动步态技能 · 目标 ' + action.distance + ' 厘米') + (disturbance ? ' · 启用摔倒测试' : ''));
    void simulate(session);
    return true;
  }

  void refreshSkill();
  $('walk-disturbance').addEventListener('change', refreshControls);
  window.addEventListener('focus', refreshSkill);
  return {handle, reset, refreshControls};
}
