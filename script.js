const grid = document.querySelector('#course-grid');
const money = value => new Intl.NumberFormat('ru-RU').format(value);
function renderCourses(filter = 'all') {
  grid.replaceChildren();
  schoolContent.courses.filter(c => filter === 'all' || c.category === filter).forEach((course, index) => {
    const card = document.createElement('article'); card.className = `course-card ${course.category}`;
    const top = document.createElement('div'); top.className = 'course-top'; top.textContent = course.tag;
    const visual = document.createElement('div'); visual.className = 'course-visual';
    const image = document.createElement('img'); image.src = course.image; image.alt = ''; image.width = 720; image.height = 480; image.loading = 'lazy'; image.decoding = 'async'; visual.append(image);
    const title = document.createElement('h3'); title.textContent = course.name;
    if (course.subtitle) { const subtitle = document.createElement('span'); subtitle.className = 'course-subtitle'; subtitle.textContent = course.subtitle; title.append(subtitle); }
    const description = document.createElement('p'); description.textContent = course.description;
    const list = document.createElement('ul'); list.className = 'course-details';
    course.skills.forEach(skill => { const li = document.createElement('li'); li.textContent = skill; list.append(li); });
    const bottom = document.createElement('div'); bottom.className = 'course-bottom';
    const cost = document.createElement('div'); cost.className = 'course-price';
    const amount = document.createElement('strong'); amount.textContent = `${money(course.price)} сум`;
    const period = document.createElement('span'); period.textContent = 'в месяц'; cost.append(amount,period);
    const link = document.createElement('a'); link.href = course.target || '#prices'; link.textContent = '↗'; link.setAttribute('aria-label', `Подробнее: ${course.name}${course.subtitle ? ' ' + course.subtitle : ''}`);
    bottom.append(cost, link); card.style.setProperty('--card-delay', `${Math.min(index, 5) * 35}ms`); card.append(top,title,visual,description,list,bottom); grid.append(card);
  });
}
renderCourses();
const priceRows = document.querySelector('#price-rows');
schoolContent.courses.forEach((course,index) => {
  const row = document.createElement('tr');
  const title = document.createElement('th'); title.scope = 'row'; title.textContent = [course.name,course.subtitle].filter(Boolean).join(' ');
  const price = document.createElement('td');
  const amount = document.createElement('span'); amount.textContent = money(course.price); price.append(amount);
  if (course.specialPrice) {
    const hint = document.createElement('button'); hint.type = 'button'; hint.className = 'price-info'; hint.dataset.discount = String(index); hint.textContent = 'ⓘ';
    hint.setAttribute('aria-label', `Скидки: ${title.textContent}`); hint.setAttribute('aria-describedby','discount-tooltip'); hint.setAttribute('aria-expanded','false'); price.append(hint);
  }
  row.append(title,price); priceRows.append(row);
});

document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); renderCourses(button.dataset.filter);
}));
document.querySelectorAll('[data-location]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-location]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  document.querySelector('#branch-name').textContent = `Филиал 0${Number(button.dataset.location)+1}`;
  document.querySelector('#location-detail').textContent = schoolContent.locations[Number(button.dataset.location)];
  document.querySelector('#map-selection').textContent = `Филиал 0${Number(button.dataset.location)+1}`;
}));
const menu = document.querySelector('.menu');
function closeMenu(){menu.setAttribute('aria-expanded','false');document.querySelector('nav').classList.remove('open');}
menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); document.querySelector('nav').classList.toggle('open',open); });
document.querySelectorAll('nav a').forEach(link => link.addEventListener('click',closeMenu));
document.addEventListener('keydown', event => {if(event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true'){closeMenu();menu.focus();}});

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Apply themes; storage is optional in file previews and restricted browsers.
const themeButton = document.querySelector('#theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themeChoice = null;
try { const stored = localStorage.getItem('stanford-theme'); if (stored === 'dark' || stored === 'light') themeChoice = stored; } catch {}
function setTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeButton.setAttribute('aria-pressed', String(dark));
  themeButton.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  themeButton.textContent = dark ? '☀' : '◐';
}
setTheme(themeChoice ? themeChoice === 'dark' : systemTheme.matches);
themeButton.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  themeChoice = dark ? 'dark' : 'light'; setTheme(dark);
  try { localStorage.setItem('stanford-theme', themeChoice); } catch {}
});
systemTheme.addEventListener('change', () => { if (!themeChoice) setTheme(systemTheme.matches); });
// A translated track loops without exposing any manual horizontal scrolling.
const viewport = document.querySelector('.team-viewport');
const track = document.querySelector('.team-grid');
const originals = [...track.children];
let teamVisible = false;
function syncTeam() { viewport.classList.toggle('in-view', teamVisible && !document.hidden && !reduced.matches); }
function measureTeam() {
  track.querySelectorAll('[data-clone]').forEach(card => card.remove());
  track.classList.toggle('can-loop', !reduced.matches);
  if (!reduced.matches && originals.length) {
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const distance = originals.at(-1).offsetLeft + originals.at(-1).offsetWidth - originals[0].offsetLeft + gap;
    if (distance > 0) {
      track.style.setProperty('--loop-distance', `${-distance}px`);
      track.style.setProperty('--loop-duration', `${distance / 25}s`);
      const copies = Math.ceil(viewport.clientWidth / distance) + 1;
      for (let i=0; i<copies; i++) originals.forEach(card => {
        const clone=card.cloneNode(true); clone.dataset.clone='true'; clone.setAttribute('aria-hidden','true'); clone.inert=true; track.append(clone);
      });
    }
  }
  syncTeam();
}
new ResizeObserver(measureTeam).observe(viewport);
new IntersectionObserver(entries => {teamVisible=entries[0].isIntersecting;syncTeam();},{threshold:.01}).observe(viewport);
document.addEventListener('visibilitychange',syncTeam);
reduced.addEventListener('change',measureTeam);
measureTeam();

// A shared tooltip remains outside the scrolling table so it cannot be clipped.
const tooltip=document.querySelector('#discount-tooltip');
let activeHint=null,hideTimer=0;
function hideDiscount(){clearTimeout(hideTimer); if(activeHint)activeHint.setAttribute('aria-expanded','false');activeHint=null;tooltip.hidden=true;}
function placeDiscount(){
  if(!activeHint)return;
  const box=activeHint.getBoundingClientRect();
  if(box.bottom<0||box.top>window.innerHeight){hideDiscount();return;}
  tooltip.style.width=`${Math.min(340,window.innerWidth-32)}px`;
  const left=Math.max(16,Math.min(box.right-tooltip.offsetWidth,window.innerWidth-tooltip.offsetWidth-16));
  const below=box.bottom+10;
  const top=below+tooltip.offsetHeight<window.innerHeight-16 ? below : Math.max(16,box.top-tooltip.offsetHeight-10);
  tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
}
function showDiscount(button){
  clearTimeout(hideTimer);if(activeHint&&activeHint!==button)activeHint.setAttribute('aria-expanded','false');activeHint=button;
  tooltip.replaceChildren();
  const title=document.createElement('strong');title.textContent='Скидки на обучение';tooltip.append(title);
  const intro=document.createElement('p');intro.textContent='При записи на два курса или обучении двух человек из одной семьи.';tooltip.append(intro);
  const courses=button.dataset.discount==='all'?schoolContent.courses.filter(c=>c.specialPrice):[schoolContent.courses[Number(button.dataset.discount)]];
  const list=document.createElement('ul');courses.forEach(course=>{const li=document.createElement('li');li.textContent=`${[course.name,course.subtitle].filter(Boolean).join(' ')} — ${money(course.specialPrice)} сум/месяц`;list.append(li);});tooltip.append(list);
  const note=document.createElement('p');note.className='tooltip-note';note.textContent='На IELTS, SAT и немецкий скидка не распространяется.';tooltip.append(note);
  tooltip.hidden=false;button.setAttribute('aria-expanded','true');placeDiscount();
}
function scheduleHide(){clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(tooltip.matches(':hover')||(activeHint===document.activeElement&&activeHint?.matches(':focus-visible')))return;hideDiscount();},180);}
document.querySelectorAll('[data-discount]').forEach(button=>{
  button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')showDiscount(button);});
  button.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')scheduleHide();});
  button.addEventListener('focus',()=>showDiscount(button));
  button.addEventListener('blur',scheduleHide);
  button.addEventListener('click',()=>showDiscount(button));
});
tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tooltip.addEventListener('pointerleave',scheduleHide);
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideDiscount();});
document.addEventListener('click',event=>{if(activeHint&&!activeHint.contains(event.target)&&!tooltip.contains(event.target))hideDiscount();});
window.addEventListener('resize',placeDiscount);window.addEventListener('scroll',placeDiscount,{passive:true,capture:true});

// Restrained entrance transitions, skipped for reduced-motion preferences.
if(!reduced.matches){
 const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');revealObserver.unobserve(entry.target);}}),{threshold:.04});
 document.querySelectorAll('main>section.section').forEach(section=>{section.classList.add('reveal');revealObserver.observe(section);});
}
