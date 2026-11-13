const key = 'microduck-custom-lessons-v1';
export const lessonTitle = name => '让MicroDuck学会' + name;
export const fallLabels = {prone: '趴倒', supine: '仰倒', side: '侧倒'};
export const defaults = {poses: ['prone', 'supine', 'side'], timeout: 6, hold: 1, episodes: 24, stepPenalty: 4};

function lessons() {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

export function saveLesson(lesson) {
  const list = lessons();
  const index = list.findIndex(item => item.id === lesson.id);
  if (index < 0) list.push(lesson);
  else list[index] = lesson;
  localStorage.setItem(key, JSON.stringify(list));
  const tab = [...document.querySelectorAll('[data-lesson-id]')].find(element => element.dataset.lessonId === lesson.id);
  if (tab) {
    tab.textContent = lesson.name;
    tab.parentElement.querySelector('.delete-training')?.setAttribute('aria-label', '删除训练「' + lesson.name + '」');
  }
}

export const activeLessonId = new URLSearchParams(location.search).get('lesson');
const templates = {
  recovery: {page: 'microduck-recovery.html', name: '摔倒站起', description: '选择倒地姿态，训练机器鸭重新站稳。'},
  stationary: {page: 'microduck-stationary.html', name: '扭胯舞', description: '自由编排机身与头部的动作目标，训练机器鸭在原地完成整段动作。'},
};
export const activeLesson = (template = 'recovery') =>
  lessons().find(item => item.id === activeLessonId && item.template === template);

const tabs = document.querySelector('.training-tabs');
if (tabs) {
  for (const lesson of lessons()) {
    const template = templates[lesson.template];
    if (!template) continue;
    const tab = document.createElement('a');
    tab.href = './' + template.page + '?lesson=' + encodeURIComponent(lesson.id);
    tab.textContent = lesson.name;
    tab.dataset.lessonId = lesson.id;
    if (lesson.id === activeLessonId) tab.setAttribute('aria-current', 'page');
    const item = document.createElement('div');
    item.className = 'custom-training-tab';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-training';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '删除训练「' + lesson.name + '」');
    remove.onclick = () => {
      localStorage.setItem(key, JSON.stringify(lessons().filter(saved => saved.id !== lesson.id)));
      if (lesson.id === activeLessonId) location.href = './microduck-training.html';
      else {
        item.remove();
        button.focus();
      }
    };
    item.append(tab, remove);
    tabs.append(item);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'create-lesson';
  button.textContent = '＋ 新建训练';
  tabs.append(button);

  const dialog = document.createElement('dialog');
  dialog.className = 'new-training-dialog';
  dialog.innerHTML = `<form>
    <h2>新建训练</h2>
    <label>训练模板<select name="template"><option value="recovery">姿态恢复</option><option value="stationary">原地动作</option></select></label>
    <label>训练名称<input name="name" maxlength="24" value="摔倒站起" required></label>
    <p data-template-description>选择倒地姿态，训练机器鸭重新站稳。</p>
    <div class="training-actions"><button type="button" class="outline" data-cancel>取消</button>
      <button type="submit" class="primary">创建训练</button></div>
  </form>`;
  document.body.append(dialog);
  button.onclick = () => dialog.showModal();
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  const form = dialog.querySelector('form');
  let previous = form.elements.template.value;
  function selectTemplate() {
    const selected = form.elements.template.value;
    const template = templates[selected];
    const input = form.elements.name;
    input.setCustomValidity('');
    if (!input.value || input.value === templates[previous].name) input.value = template.name;
    dialog.querySelector('[data-template-description]').textContent = template.description;
    previous = selected;
  }
  form.elements.template.onchange = selectTemplate;
  form.elements.name.oninput = () => form.elements.name.setCustomValidity('');
  form.onsubmit = event => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      form.elements.name.focus();
      return;
    }
    const template = form.elements.template.value;
    if (template === 'stationary' && !/^[\p{L}\p{N} _-]{1,24}$/u.test(name)) {
      form.elements.name.setCustomValidity('请使用汉字、字母、数字、空格或连字符。');
      form.elements.name.reportValidity();
      return;
    }
    const lesson = {id: crypto.randomUUID(), template, name, settings: template === 'recovery' ? {...defaults} : null};
    saveLesson(lesson);
    location.href = './' + templates[template].page + '?lesson=' + encodeURIComponent(lesson.id);
  };
  const task = document.body.dataset.task;
  if (templates[task] && !activeLesson(task)) {
    form.elements.template.value = task;
    selectTemplate();
    dialog.showModal();
  }
}
