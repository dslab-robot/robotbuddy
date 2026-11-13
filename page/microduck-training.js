import {createTrainingScene} from './microduck-training-scene.js';

const $ = id => document.getElementById(id);
const walking = document.body.dataset.task === 'walking';
const turning = document.body.dataset.task === 'turning';
const motion = walking || turning;
const taskMode = () => turning ? 'turning' : $('training-distance')?.value === '10' ? 'short' : 'walking';
const deg = degrees => degrees.toFixed(1) + '°';
const stageLabels = {baseline: turning ? '官方转向基线' : walking ? '官方步态直行' : '随机动作', early: '训练早期', middle: '训练中期', final: '训练后'};
const rate = point => motion ? point.best.passed / point.best.total : point.passed / point.window;
const cm = metres => (metres * 100).toFixed(1) + ' 厘米';
const countUnit = motion ? ' 组' : ' 局';
const goalNames = ['左上方', '正前方', '右下方'];
const headPresets = {
  左上方: [.45, .26, .33],
  正前方: [.52, 0, .25],
  右下方: [.45, -.26, .17],
  左下方: [.45, .26, .17],
};
const historyKey = 'microduck-training-history-v1';
const activeKey = turning ? 'microduck-turning-active-v1' : walking ? 'microduck-walking-active-v1' : 'microduck-training-active-v1';
const chart = $('learning-chart');
const stageButtons = [...document.querySelectorAll('[data-stage]')];
const settingsControls = [$('training-task'), $('training-episodes'), $('training-tolerance'), $('training-penalty'),
  $('training-distance'), $('training-angle'), $('training-direction'), $('target-lateral'), $('target-height'),
  ...document.querySelectorAll('[data-goal]')].filter(Boolean);

function readHistory() {
  try { return JSON.parse(localStorage.getItem(historyKey) || '[]'); } catch { return []; }
}

let comparisons = readHistory();
let job = null;
let pollTimer = null;
let scene = null;
let sceneError = false;
let followLatest = true;
let selectedStage = null;
let selectedReplay = null;
let playbackRequest = 0;
let submitting = false;
let syncing = false;
let savingSkill = false;
let savedJob = null;

function notice(message, error = false) {
  $('training-message').textContent = message;
  $('training-message').classList.toggle('error', error);
}

async function api(path, options) {
  const response = await fetch('./api/training' + path, options);
  const result = await response.json();
  if (!response.ok) {
    const error = Error(result.error || '训练服务暂时不可用。');
    error.status = response.status;
    throw error;
  }
  return result;
}

function goalFor(text) {
  const command = text.trim().replace(/[。！!]+$/, '');
  const target = command.match(/^(?:(?:请\s*)?(?:让\s*)?(?:Microduck|机器鸭|它)?\s*(?:看向|朝向|对准)\s*)?(左上方|正前方|右下方|左下方|自定义目标)(?:的?(?:目标|橙球|球))?$/i);
  if (!target) throw Error('请输入目标方向，比如「让机器鸭看向左下方」，也可以用滑杆摆放自定义目标。');
  const name = target[1];
  if (goalNames.includes(name)) return {goal: goalNames.indexOf(name)};
  return {goal: 'custom', target: name === '左下方' ? {lateralCm: 26, heightCm: 17} :
    {lateralCm: -Number($('target-lateral').value), heightCm: Number($('target-height').value)}};
}

function lateralLabel(value) {
  return value > 0 ? '向左 ' + value + ' 厘米' : value < 0 ? '向右 ' + Math.abs(value) + ' 厘米' : '居中';
}

function goalLabel(settings) {
  if (settings.goal !== 'custom') return goalNames[settings.goal];
  const {lateralCm, heightCm} = settings.target;
  if (lateralCm === 26 && heightCm === 17) return '左下方';
  return lateralLabel(lateralCm) + '，高 ' + heightCm + ' 厘米';
}

function headPoint(settings) {
  if (settings.goal !== 'custom') return headPresets[goalNames[settings.goal]];
  return [.45, settings.target.lateralCm / 100, settings.target.heightCm / 100];
}

function showHeadTarget(settings, edit = false) {
  const point = headPoint(settings);
  $('target-lateral').value = Math.round(-point[1] * 100);
  $('target-height').value = Math.round(point[2] * 100);
  $('target-lateral-value').value = lateralLabel(Math.round(point[1] * 100));
  $('target-height-value').value = Math.round(point[2] * 100) + ' 厘米';
  $('target-forward-distance').textContent = '目标距机身原点向前 ' + Math.round(point[0] * 100) + ' 厘米';
  document.querySelectorAll('[data-goal]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.goal === goalLabel(settings)));
  });
  if (edit) {
    playbackRequest++;
    selectedStage = selectedReplay = null;
    followLatest = false;
    if (scene) $('replay-status').textContent = '目标预览';
    $('replay-summary').textContent = '调整橙球位置后，点击「开始训练」。';
    render();
  }
  scene?.previewTarget(point);
}

function renderChart() {
  const width = chart.clientWidth;
  const height = chart.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(devicePixelRatio, 2);
  chart.width = width * ratio;
  chart.height = height * ratio;
  const context = chart.getContext('2d');
  context.scale(ratio, ratio);
  const left = 35;
  const right = width - 13;
  const top = 10;
  const bottom = height - 19;
  context.font = '10px "Segoe UI",sans-serif';
  context.strokeStyle = '#deebe2';
  context.fillStyle = '#5e766f';
  const samples = job?.history || [];
  const chartMax = motion ? Math.max(turning ? .06 : .12, ...samples.map(point => point.candidate.drift)) : 1;
  const valueAt = point => motion ? point.best.drift : rate(point);
  for (const fraction of [0, .5, 1]) {
    const y = bottom - (bottom - top) * fraction;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(right, y);
    context.stroke();
    const axisLabel = motion ? Math.round(fraction * chartMax * 100) + ' cm' : fraction * 100 + '%';
    context.fillText(axisLabel, 1, y + 3);
  }
  context.fillText('0' + countUnit, left, height - 2);
  const total = job?.settings.episodes || Number($('training-episodes').value);
  const endLabel = total + countUnit;
  context.fillText(endLabel, right - context.measureText(endLabel).width, height - 2);
  const label = turning ? '转身时的平均最大移位曲线' : walking ? '试走时的平均最大偏离曲线' : '最近达标率曲线';
  chart.setAttribute('aria-label', samples.length
    ? label + '，最新最佳值为 ' + (motion ? cm(valueAt(samples.at(-1))) : Math.round(rate(samples.at(-1)) * 100) + '%')
    : label + '，等待训练数据');
  if (!samples.length) return;
  const pointX = point => left + (right - left) * point.episode / total;
  const pointY = value => bottom - (bottom - top) * value / chartMax;
  if (motion) {
    context.fillStyle = '#91ada4';
    for (const point of samples) {
      context.beginPath();
      context.arc(pointX(point), pointY(point.candidate.drift), 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.strokeStyle = '#147e65';
  context.lineWidth = 2;
  context.beginPath();
  for (const [index, point] of samples.entries()) {
    const x = pointX(point);
    const y = pointY(valueAt(point));
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  }
  context.stroke();
  const latest = samples.at(-1);
  context.fillStyle = '#147e65';
  context.beginPath();
  context.arc(pointX(latest), pointY(valueAt(latest)), 3.5, 0, Math.PI * 2);
  context.fill();
}

function renderComparisons() {
  if (motion) {
    renderWalkingComparison();
    return;
  }
  if (!comparisons.length) return;
  const output = $('comparison-output');
  const table = document.createElement('table');
  table.className = 'comparison-table';
  const columns = [
    ['目标', run => goalLabel(run.settings)],
    ['每步扣分', run => run.settings.stepPenalty.toFixed(2)],
    ['训练局数 / 达标线', run => run.settings.episodes + ' 局 / ' + run.settings.tolerance + '°'],
    ['达标数', run => run.summary.trained.passed + ' / ' + run.summary.trained.count],
    ['平均步数', run => run.summary.trained.averageMoves.toFixed(1) + ' 步'],
    ['平均偏差', run => run.summary.trained.averageError.toFixed(1) + '°'],
  ];
  const header = table.createTHead().insertRow();
  const label = document.createElement('th');
  label.textContent = '测试结果';
  header.append(label);
  comparisons.forEach((run, index) => {
    const cell = document.createElement('th');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '查看第 ' + (index + 1) + ' 轮';
    button.disabled = Boolean(job?.status === 'running') || submitting;
    button.onclick = () => openRun(run.id);
    cell.append(button);
    header.append(cell);
  });
  const tbody = table.createTBody();
  for (const [title, value] of columns) {
    const row = tbody.insertRow();
    row.insertCell().textContent = title;
    comparisons.forEach(run => { row.insertCell().textContent = value(run); });
  }
  const detail = document.createElement('p');
  detail.className = 'chart-caption';
  const [a, b] = comparisons;
  detail.textContent = b && (JSON.stringify(headPoint(a.settings)) !== JSON.stringify(headPoint(b.settings)) ||
      a.settings.tolerance !== b.settings.tolerance || a.settings.episodes !== b.settings.episodes)
    ? '两轮的目标、达标线或局数不同。要单独比较奖励，请保持这些设置一致。'
    : '测试开局与训练开局分开。每局最多 20 步，达到阈值后停止。';
  output.className = '';
  output.replaceChildren(table, detail);
}

function renderWalkingComparison() {
  const output = $('comparison-output');
  const result = job?.summary;
  if (!result) {
    output.className = 'comparison-empty';
    output.textContent = turning ? '训练完成后比较转角误差和身体移位。' : '训练完成后，用 5 种新开局比较官方步态与训练后走法。';
    return;
  }
  const table = document.createElement('table');
  table.className = 'comparison-table';
  const header = table.createTHead().insertRow();
  for (const title of ['验证结果', turning ? '官方转向基线' : '官方步态直行', '训练后']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    header.append(cell);
  }
  const body = table.createTBody();
  const rows = [
    ['达标次数', m => m.passed + ' / ' + m.total],
    ...(turning ? [['平均转角', m => deg(m.distance)], ['平均转角误差', m => deg(m.error)]] : [['平均前进距离', m => cm(m.distance)]]),
    [turning ? '平均最大移位' : '平均最大偏离', m => cm(m.drift)],
    ['平均用时', m => m.seconds.toFixed(2) + ' 秒'],
  ];
  for (const [title, value] of rows) {
    const row = body.insertRow();
    for (const text of [title, value(result.baseline), value(result.final)]) row.insertCell().textContent = text;
  }
  output.className = '';
  output.replaceChildren(table);
}

function render() {
  const running = job?.status === 'running';
  const point = job?.history.at(-1);
  const total = job?.settings.episodes || Number($('training-episodes').value);
  const labels = {running: '训练中', completed: '已完成', cancelled: '已停止', failed: '训练失败'};
  $('job-status').textContent = job?.queuePosition ? '排队中 · 第 ' + job.queuePosition + ' 位' : job ? labels[job.status] : '等待开始';
  $('job-progress').max = total;
  $('job-progress').value = point?.episode || 0;
  $('episode-count').textContent = job ? (point?.episode || 0) + ' / ' + total : '—';
  $('training-rate').textContent = point ? Math.round(rate(point) * 100) + '%' : '—';
  $('training-steps').textContent = point ? (motion ? cm(point.best.drift) : point.averageMoves.toFixed(1) + ' 步') : '—';
  $('training-start').disabled = Boolean(running || submitting);
  $('training-stop').hidden = !running;
  settingsControls.forEach(element => { element.disabled = Boolean(running || submitting); });
  stageButtons.forEach(button => {
    button.disabled = !job?.replays[button.dataset.stage] || !scene;
    button.setAttribute('aria-pressed', String(button.dataset.stage === selectedStage));
  });
  $('replay-again').disabled = !selectedReplay || !scene;
  if (motion) $('save-walking-skill').disabled = savingSkill || job?.status !== 'completed' || !job.summary.final.passed || job.id === savedJob;
  renderChart();
  renderComparisons();
}

function resetPlayback() {
  playbackRequest++;
  selectedStage = selectedReplay = null;
  followLatest = true;
  scene?.reset();
  $('replay-status').textContent = sceneError ? '3D 加载失败' : scene ? '等待回放' : '加载模型中';
  $('replay-summary').textContent = '各阶段的回放会在训练过程中依次开放。';
}

async function playStage(stage) {
  if (!job?.replays[stage] || !scene) return;
  if (stage === selectedStage && selectedReplay) {
    scene.play(selectedReplay);
    return;
  }
  const request = ++playbackRequest;
  const id = job.id;
  selectedStage = stage;
  selectedReplay = null;
  $('replay-status').textContent = '加载回放';
  render();
  try {
    const replay = await api('/' + id + '/replays/' + stage);
    if (request !== playbackRequest || job?.id !== id) return;
    selectedReplay = replay;
    scene.play(replay);
    $('replay-status').textContent = stageLabels[stage];
    $('replay-summary').textContent = turning
      ? (replay.direction === 'left' ? '左转 ' : '右转 ') + deg(replay.distance) + ' / ' + replay.angle + '° · 最大移位 ' + cm(replay.drift) + ' · ' + (replay.passed ? '达标' : replay.fell ? '摔倒' : '未达标')
      : walking
      ? '前进 ' + cm(replay.distance) + ' · 最大偏离 ' + cm(replay.drift) + ' · ' + replay.seconds.toFixed(2) + ' 秒 · ' +
        (replay.passed ? '达标' : replay.fell ? '摔倒' : '未达标')
      : goalLabel(job.settings) + ' · ' + replay.moves + ' 步 · 最后偏差 ' + replay.error.toFixed(1) + '° · ' +
        (replay.passed ? '达标' : '未达标');
    render();
  } catch (error) {
    if (request !== playbackRequest) return;
    $('replay-status').textContent = '回放加载失败';
    $('replay-summary').textContent = error.message;
  }
}

function playLatest() {
  if (!followLatest || !job || !scene) return;
  const latest = Object.keys(stageLabels).filter(stage => job.replays[stage]).at(-1);
  if (latest && latest !== selectedStage) void playStage(latest);
}

function storeComplete(done) {
  if (comparisons.some(run => run.id === done.id)) return;
  comparisons = [...comparisons, {id: done.id, settings: done.settings, summary: done.summary}].slice(-2);
  localStorage.setItem(historyKey, JSON.stringify(comparisons));
}

function updateJob(next) {
  job = next;
  if (next.status === 'completed') {
    if (!motion) storeComplete(next);
    localStorage.setItem(activeKey, next.id);
    notice(motion ? '本轮已完成。点击「训练后」查看实际动作。' : '本轮已完成。可改一项设置再练，比较下面的测试结果。');
  } else if (next.status === 'running') {
    localStorage.setItem(activeKey, next.id);
    notice(next.queuePosition ? '排队中。前面的任务完成后会自动开始。' : '正在运行 MuJoCo。回放生成后可以点阶段查看。');
  } else {
    localStorage.removeItem(activeKey);
    notice(next.error || '已停止本轮训练。', next.status === 'failed');
  }
  render();
  playLatest();
}

function schedule(id) {
  clearTimeout(pollTimer);
  if (job?.status !== 'running') return;
  pollTimer = setTimeout(async () => {
    try {
      const next = await api('/' + id);
      if (job?.id !== id || job.status !== 'running') return;
      updateJob(next);
    } catch (error) {
      if (job?.id !== id || job.status !== 'running') return;
      if (error.status === 404) {
        job = null;
        localStorage.removeItem(activeKey);
        resetPlayback();
        render();
        notice(error.message, true);
        return;
      }
      notice('暂时连不上训练服务，正在重试。', true);
    }
    schedule(id);
  }, motion ? 300 : 650);
}

async function openRun(id) {
  if (job?.status === 'running' || syncing) return;
  syncing = true;
  try {
    const found = await api('/' + id);
    if (submitting || job?.status === 'running') return;
    if (walking) {
      $('training-distance').value = found.settings.task === 'short' ? '10' : '50';
      updateWalkingLabels();
    }
    if (turning) {
      $('training-angle').value = found.settings.angle;
      $('training-direction').value = found.settings.direction;
    }
    resetPlayback();
    if (!motion) {
      $('training-task').value = '让机器鸭看向' + (found.settings.goal === 'custom' && goalLabel(found.settings) !== '左下方' ? '自定义目标' : goalLabel(found.settings));
      showHeadTarget(found.settings);
    }
    updateJob(found);
    schedule(id);
  } catch (error) {
    if (error.status === 404) localStorage.removeItem(activeKey);
    notice(error.message, true);
  } finally {
    syncing = false;
  }
}

$('training-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting || job?.status === 'running') return;
  try {
    const settings = {
      episodes: Number($('training-episodes').value),
      stepPenalty: Number($('training-penalty').value),
      ...(motion ? {task: taskMode(), ...(turning ? {angle: Number($('training-angle').value), direction: $('training-direction').value} : {})} : {
        ...goalFor($('training-task').value),
        tolerance: Number($('training-tolerance').value),
      }),
    };
    submitting = true;
    render();
    const next = await api('', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(settings)});
    resetPlayback();
    if (motion) $('save-skill-message').textContent = '';
    else showHeadTarget(next.settings);
    updateJob(next);
    schedule(next.id);
  } catch (error) {
    notice(error.message, true);
  } finally {
    submitting = false;
    render();
  }
});

$('training-stop').onclick = async () => {
  try {
    const stopped = await api('/' + job.id, {method: 'DELETE'});
    clearTimeout(pollTimer);
    updateJob(stopped);
  } catch (error) { notice(error.message, true); }
};
if (!motion) {
  const task = $('training-task');
  function updateTypedTarget() {
    let settings;
    try { settings = goalFor(task.value); } catch { return; }
    showHeadTarget(settings, true);
  }
  document.querySelectorAll('[data-goal]').forEach(button => {
    button.onclick = () => {
      task.value = '让机器鸭看向' + button.dataset.goal;
      updateTypedTarget();
    };
  });
  task.addEventListener('input', updateTypedTarget);
  for (const id of ['target-lateral', 'target-height']) {
    $(id).addEventListener('input', () => {
      task.value = '让机器鸭看向自定义目标';
      updateTypedTarget();
    });
  }
  showHeadTarget(goalFor(task.value));
}
$('training-penalty').oninput = event => {
  $('penalty-value').value = Number(event.target.value).toFixed(2);
};
$('training-episodes').onchange = () => { if (!job) render(); };
stageButtons.forEach(button => {
  button.onclick = () => { followLatest = false; void playStage(button.dataset.stage); };
});
$('replay-again').onclick = () => { if (selectedReplay) scene?.play(selectedReplay); };
new ResizeObserver(renderChart).observe(chart);
render();

createTrainingScene($('training-scene'), {walking: motion, turning, onFrame: measurement => {
  $('walking-distance').textContent = turning ? deg(measurement) : cm(measurement);
}}).then(viewer => {
  scene = viewer;
  if (walking) updateWalkingLabels();
  if (!motion) {
    let settings = job?.settings || {goal: 0};
    if (!job) {
      try { settings = goalFor($('training-task').value); } catch { /* Keep the last valid default. */ }
    }
    showHeadTarget(settings);
  }
  $('replay-status').textContent = '模型已就绪';
  render();
  playLatest();
}).catch(() => {
  sceneError = true;
  $('replay-status').textContent = '3D 加载失败';
  $('replay-summary').textContent = '训练结果仍可在下方查看。';
});
if (motion) $('save-walking-skill').onclick = async () => {
  if (savingSkill || job?.status !== 'completed') return;
  const id = job.id;
  savingSkill = true;
  render();
  const message = $('save-skill-message');
  message.textContent = '正在保存…';
  try {
    const skillRoute = job.settings.task === 'walking' ? '/skill' : '/skill/' + job.settings.task;
    await api(skillRoute, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
    savedJob = id;
    if (job?.id === id) message.textContent = '已保存。工作台会使用这套技能。';
  } catch (error) {
    if (job?.id === id) message.textContent = error.message;
  } finally {
    savingSkill = false;
    render();
  }
};
function updateWalkingLabels() {
  const short = taskMode() === 'short';
  const distance = short ? 10 : 50;
  $('walking-subtitle').textContent = short ? '走到目标附近并保持站立 0.5 秒。' : '沿走廊走过终点线，保持站立 0.6 秒。';
  $('walking-marker').textContent = distance + ' 厘米终点';
  $('walking-reward').textContent = short ? '停在 8–12 厘米且站稳即达标。偏离、耗时和摔倒扣分。' :
    '前进和达标加分，偏离、耗时和摔倒扣分。身体中心距中心线超过 12 厘米会判为未达标。';
  if (!selectedReplay) scene?.setDistance(distance / 100);
}
if (walking) $('training-distance').onchange = () => {
  job = null;
  localStorage.removeItem(activeKey);
  resetPlayback();
  updateWalkingLabels();
  $('save-skill-message').textContent = '';
  notice('准备训练。完成后可以把步态保存到工作台。');
  render();
};
const activeId = localStorage.getItem(activeKey);
if (activeId) void openRun(activeId);
