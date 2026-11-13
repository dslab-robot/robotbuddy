const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const item = document.querySelector('[data-runtime-kind]');
if (item) {
  if (item.dataset.runtimeKind === 'workbench') item.textContent = local ? '本地演示' : '在线工作台';
  else {
    const label = document.createTextNode(local ? ' MuJoCo · 本地 CPU' : ' MuJoCo · 服务端 CPU');
    const indicator = document.createElement('i');
    item.replaceChildren(indicator, label);
  }
}
