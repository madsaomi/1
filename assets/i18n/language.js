// Shared language enhancement for the directory and career pages.
(() => {
function setupLanguage() {
  const packs = { uz: window.stanfordUz, kaa: window.stanfordKaa, en: window.stanfordEn };
  // /uz/ and /kaa/ hold copies translated at build time; there the switch opens the other copy instead.
  const pageCopy = Object.hasOwn(packs, document.documentElement.dataset?.langPage) ? document.documentElement.dataset.langPage : '';
  // Copies sit under /uz/, /kaa/ and /en/ at the site root, also for deeper pages: /uz/courses/ielts.
  const addressFor = code => {
    const path = location.pathname.replace(/^\/(?:uz|kaa|en)(?=\/)/, '');
    return `${code === 'ru' ? '' : `/${code}`}${path}${location.hash}`;
  };
  const select = document.querySelector('#lang-toggle');
  if (!select) return;
  const attributes = ['aria-label', 'alt', 'title', 'placeholder', 'content'];
  const cyrillic = /[А-Яа-яЁё]/;
  const texts = new Map();
  const attrs = new Map();
  let lang = 'ru';
  const translate = value => {
    const raw = value.trim();
    if (!raw) return value;
    const pack = packs[lang];
    if (!pack) return value;
    let out = pack.strings[raw.replace(/\s+/g, ' ')];
    if (out === undefined) {
      for (const [pattern, build] of pack.patterns || []) {
        const match = raw.match(pattern);
        if (match) { out = build(match, translate); break; }
      }
    }
    if (out === undefined) return value;
    return value.match(/^\s*/)[0] + out + value.match(/\s*$/)[0];
  };
  const translateAttribute = (element, name) => {
    const value = element.getAttribute(name);
    if (!value || !cyrillic.test(value)) return;
    const next = translate(value);
    if (next === value) return;
    if (!attrs.has(element)) attrs.set(element, {});
    attrs.get(element)[name] = { source: value, translated: next };
    element.setAttribute(name, next);
  };
  const translateNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!cyrillic.test(node.data)) return;
      const next = translate(node.data);
      if (next !== node.data) { texts.set(node, { source: node.data, translated: next }); node.data = next; }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    attributes.forEach(name => translateAttribute(node, name));
    node.childNodes.forEach(translateNode);
  };
  const restore = () => {
    texts.forEach((entry, node) => { if (node.data === entry.translated) node.data = entry.source; });
    attrs.forEach((values, element) => Object.entries(values).forEach(([name, entry]) => {
      if (element.getAttribute(name) === entry.translated) element.setAttribute(name, entry.source);
    }));
    texts.clear();
    attrs.clear();
  };
  const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(records => {
    if (lang === 'ru') return;
    records.forEach(record => {
      if (record.type === 'childList') record.addedNodes.forEach(translateNode);
      else if (record.type === 'characterData') translateNode(record.target);
      else translateAttribute(record.target, record.attributeName);
    });
    observer.takeRecords(); // our own replacements need no second pass
  });
  observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  const setLanguage = next => {
    // Always translate from the Russian source, including a direct UZ ↔ QQ change.
    restore();
    lang = next === 'ru' || (Object.hasOwn(packs, next) && packs[next]) ? next : 'ru';
    if (lang !== 'ru') translateNode(document.documentElement);
    document.documentElement.lang = lang;
    select.value = lang;
    observer?.takeRecords();
  };
  select.addEventListener('change', () => {
    // Russian pages carry no dictionaries: the translated copy of the page is opened instead.
    if (!pageCopy && select.value !== 'ru' && Object.hasOwn(packs, select.value) && !packs[select.value]) {
      try { localStorage.setItem('stanford-lang', select.value); } catch { /* Keep the choice for this visit only. */ }
      location.assign(addressFor(select.value));
      return;
    }
    if (pageCopy) {
      const next = select.value === 'ru' || Object.hasOwn(packs, select.value) ? select.value : pageCopy;
      try { localStorage.setItem('stanford-lang', next); } catch { /* Keep the choice for this visit only. */ }
      if (next !== pageCopy) location.assign(addressFor(next));
      return;
    }
    setLanguage(select.value);
    try { localStorage.setItem('stanford-lang', lang); } catch { /* Keep the choice for this visit only. */ }
  });
  let saved;
  try { saved = localStorage.getItem('stanford-lang'); } catch { /* Settings are optional. */ }
  // A translated copy always shows its own language; text added later by scripts is still translated.
  setLanguage(pageCopy || saved || 'ru');
}
setupLanguage();
})();
