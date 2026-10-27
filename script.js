// Progressive enhancement: programs and prices remain available without JavaScript.
const content = window.schoolContent;
const money = value => new Intl.NumberFormat('ru-RU').format(value);
const filters = [...document.querySelectorAll('[data-filter]')];
const cards = [...document.querySelectorAll('[data-course-id]')];
const courseStatus = document.querySelector('#course-filter-status');
const resetFilter = document.querySelector('#reset-filter');
function filterCourses(category, label) {
  let count = 0;
  cards.forEach(card => {
    card.hidden = category !== 'all' && card.dataset.category !== category;
    if (!card.hidden) count++;
  });
  filters.forEach(button => {
    const active = button.dataset.filter === category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  courseStatus.textContent = `${label}. Программ: ${count}.`;
  resetFilter.hidden = category === "all";
}
resetFilter.addEventListener('click', () => {
  filterCourses('all', 'Все программы');
  filters.find(button => button.dataset.filter === 'all')?.focus();
});
filters.forEach(button => button.addEventListener('click', () => filterCourses(button.dataset.filter, button.dataset.filterLabel || button.textContent.trim())));
document.querySelectorAll('[data-goal]').forEach(link => link.addEventListener('click', () => {
  const filter = filters.find(button => button.dataset.filter === link.dataset.goal);
  if (filter) filterCourses(filter.dataset.filter, filter.dataset.filterLabel || filter.textContent.trim());
}));

const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
const menuViewport = matchMedia('(max-width: 1050px)');
function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Открыть меню');
  navigation.classList.remove('open');
}
menu.addEventListener('click', event => {
  if (menu.getAttribute('aria-expanded') === 'true') return closeMenu();
  menu.setAttribute('aria-expanded', 'true');
  menu.setAttribute('aria-label', 'Закрыть меню');
  navigation.classList.add('open');
  if (event.detail === 0) navigation.querySelector('a')?.focus();
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
navigation.addEventListener('focusout', event => {
  if (!navigation.contains(event.relatedTarget) && !menu.contains(event.relatedTarget)) closeMenu();
});
document.addEventListener('pointerdown', event => {
  if (!navigation.contains(event.target) && !menu.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
});
menuViewport.addEventListener('change', closeMenu);

const themeButton = document.querySelector('#theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themeChoice;
try { themeChoice = localStorage.getItem('stanford-theme'); } catch { /* Settings are optional. */ }
if (!['light', 'dark'].includes(themeChoice)) themeChoice = null;
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
}
setTheme(themeChoice ? themeChoice === 'dark' : systemTheme.matches);
themeButton.addEventListener('click', () => {
  themeChoice = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(themeChoice === 'dark');
  try { localStorage.setItem('stanford-theme', themeChoice); } catch { /* Keep the current session choice. */ }
});
systemTheme.addEventListener('change', () => { if (!themeChoice) setTheme(systemTheme.matches); });

const branchMap = document.querySelector('#branch-map');
const mapStatus = document.querySelector('#map-status');
const locationButtons = [...document.querySelectorAll('[data-map-location]')];
const providerButtons = [...document.querySelectorAll('button[data-map-provider]')];
let selectedLocation = locationButtons.find(button => button.getAttribute('aria-pressed') === 'true');
let mapProvider = branchMap?.dataset.mapProvider || 'yandex';
function updateBranchMap(location, provider) {
  if (!branchMap || !location || !locationButtons.includes(location)) return;
  selectedLocation = location;
  mapProvider = provider === 'google' && location.dataset.mapGoogleSrc ? 'google' : 'yandex';
  const src = mapProvider === 'google' ? location.dataset.mapGoogleSrc : location.dataset.mapSrc;
  if (branchMap.getAttribute('src') !== src) branchMap.src = src;
  branchMap.title = location.dataset.mapTitle;
  branchMap.dataset.mapProvider = mapProvider;
  locationButtons.forEach(item => item.setAttribute('aria-pressed', String(item === location)));
  providerButtons.forEach(item => {
    item.setAttribute('aria-pressed', String(item.dataset.mapProvider === mapProvider));
    item.disabled = item.dataset.mapProvider === 'google' && !location.dataset.mapGoogleSrc;
  });
  if (mapStatus) mapStatus.textContent = location.dataset.mapLabel;
}
locationButtons.forEach(button => button.addEventListener('click', () => {
  if (!branchMap) return;
  updateBranchMap(button, mapProvider);
  if (mapStatus && matchMedia('(max-width: 760px)').matches) {
    mapStatus.focus({ preventScroll: true });
    mapStatus.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}));
providerButtons.forEach(button => button.addEventListener('click', () => {
  if (!button.disabled) updateBranchMap(selectedLocation, button.dataset.mapProvider);
}));

const dialog = document.querySelector('#enroll-modal');
const courseSelect = document.querySelector('#contact-course');
const modalBody = document.querySelector('.modal-body');
let dialogTrigger;
let previousOverflow = '';
function appendExternalIcon(link) {
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 3h6v6 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
  link.append(icon);
}
function updateCourseSummary() {
  const course = content.courses.find(item => item.id === courseSelect.value);
  const summary = document.querySelector('#selected-course');
  summary.replaceChildren();
  if (!course) return;
  const title = document.createElement('h3');
  title.textContent = [course.name, course.subtitle].filter(Boolean).join(' ');
  const description = document.createElement('p'); description.textContent = course.description;
  const price = document.createElement('div');
  price.className = 'dialog-pricing';
  const prices = document.createElement('dl');
  prices.className = 'dialog-prices';
  function addPrice(label, amount) {
    const row = document.createElement('div');
    const caption = document.createElement('dt'); caption.textContent = label;
    const value = document.createElement('dd'); value.textContent = `${money(amount)} сум`;
    const period = document.createElement('span'); period.textContent = 'в месяц';
    value.append(period);
    row.append(caption, value);
    prices.append(row);
  }
  addPrice('Обычная цена', course.price);
  if (course.specialPrice) addPrice('Семья / два курса', course.specialPrice);
  price.append(prices);
  if (course.specialPrice) {
    const conditions = document.createElement('p');
    conditions.className = 'dialog-price-note';
    conditions.textContent = 'Специальная цена — для семьи или записи на два курса. Условия и итоговую стоимость подтвердите перед оплатой.';
    price.append(conditions);
  }
  const skills = document.createElement('ul');
  skills.setAttribute('aria-label', 'В программе курса');
  course.skills.forEach(skill => { const item = document.createElement('li'); item.textContent = skill; skills.append(item); });
  const catalogLink = document.createElement('a');
  catalogLink.className = 'link dialog-catalog-link';
  catalogLink.href = `#course-${course.id}`;
  catalogLink.dataset.revealCourse = course.id;
  catalogLink.textContent = 'К карточке программы';
  appendExternalIcon(catalogLink);
  summary.append(title, description, price, skills, catalogLink);
  if (course.category === 'exam') {
    const examLink = document.createElement('a');
    examLink.className = 'link dialog-exam-link';
    examLink.href = course.target;
    examLink.dataset.examDetails = course.id;
    examLink.textContent = `О подготовке к ${course.name}`;
    appendExternalIcon(examLink);
    summary.append(examLink);
  }
  modalBody.scrollTop = 0;
}
function openModal(courseId, trigger) {
  if (typeof dialog.showModal !== 'function') { location.hash = 'prices'; return; }
  closeMenu();
  if (content.courses.some(course => course.id === courseId)) courseSelect.value = courseId;
  updateCourseSummary();
  dialogTrigger = trigger;
  previousOverflow = document.body.style.overflow;
  dialog.showModal();
  document.body.style.overflow = 'hidden';
  modalBody.scrollTop = 0;
  courseSelect.focus({ preventScroll: true });
}
function closeDialogForNavigation() {
  if (dialog.open) { dialogTrigger = null; dialog.close(); }
}
function revealExam(courseId) {
  const course = content.courses.find(item => item.id === courseId && item.category === 'exam');
  if (!course) return false;
  const panel = document.querySelector(course.target);
  if (!panel) return false;
  closeDialogForNavigation();
  const details = panel.querySelector('details');
  if (details) details.open = true;
  panel.focus({ preventScroll: true });
  return true;
}
function revealCourse(courseId) {
  const card = cards.find(item => item.dataset.courseId === courseId);
  if (!card) return false;
  closeDialogForNavigation();
  filterCourses('all', 'Все программы');
  card.focus({ preventScroll: true });
  return true;
}
function revealCourseFromHash() {
  const match = (window.location?.hash || '').match(/^#course-([a-z0-9-]+)$/);
  if (match && revealCourse(match[1])) cards.find(card => card.dataset.courseId === match[1]).scrollIntoView({ block: 'start' });
}
window.addEventListener('hashchange', revealCourseFromHash);

document.addEventListener('click', event => {
  const examLink = event.target.closest('[data-exam-details]');
  if (examLink) { revealExam(examLink.dataset.examDetails); return; }
  const catalogLink = event.target.closest('[data-reveal-course]');
  if (catalogLink) { revealCourse(catalogLink.dataset.revealCourse); return; }
  const trigger = event.target.closest('.open-enroll-btn, [data-open-course]');
  if (!trigger) return;
  event.preventDefault();
  openModal(trigger.dataset.openCourse, trigger);
});
courseSelect.addEventListener('change', updateCourseSummary);
document.querySelector('#modal-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => {
  document.body.style.overflow = previousOverflow;
  if (dialogTrigger?.isConnected) dialogTrigger.focus();
});

filterCourses("all", "Все программы");
revealCourseFromHash();

// Expose enhancement-only controls only after successful initialization.
document.documentElement.dataset.enhanced = "true";

// Presentation only: the content remains visible without observer support.
function setupReveal() {
  if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sections = [...document.querySelectorAll('[data-reveal]')];
  if (!sections.length) return;
  let observer;
  try {
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { threshold: .08 });
    sections.forEach(section => observer.observe(section));
  } catch (error) {
    observer?.disconnect();
    console.warn('Section animation unavailable; content remains visible.', error);
  }
}
setupReveal();
