const navigation = document.querySelector('.device-menu');
let expanded = null;

function show(category) {
  if (expanded === category) return;
  if (expanded) {
    expanded.querySelector('button').setAttribute('aria-expanded', 'false');
    expanded.querySelector('ul').hidden = true;
  }
  expanded = category;
  if (category) {
    category.querySelector('button').setAttribute('aria-expanded', 'true');
    category.querySelector('ul').hidden = false;
  }
}

for (const category of navigation.querySelectorAll('.device-category')) {
  const button = category.querySelector('button');
  category.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') show(category);
  });
  category.addEventListener('pointerleave', event => {
    if (event.pointerType === 'mouse' && expanded === category &&
        !category.querySelector('ul').contains(document.activeElement)) show(null);
  });
  button.addEventListener('click', event => {
    if (event.pointerType === 'mouse') show(category);
    else show(expanded === category ? null : category);
  });
  category.addEventListener('focusout', event => {
    if (expanded === category && !category.contains(event.relatedTarget)) show(null);
  });
  category.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      show(category);
      const links = [...category.querySelectorAll('a')];
      const next = (links.indexOf(document.activeElement) + 1) % links.length;
      links[next].focus();
    }
    if (event.key === 'Escape' && expanded === category) {
      event.preventDefault();
      show(null);
      button.focus();
    }
  });
}
document.addEventListener('pointerdown', event => {
  if (!navigation.contains(event.target)) show(null);
});
