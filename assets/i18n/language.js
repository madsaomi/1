// Shared language enhancement for the results and career pages.
(() => {
function setupLanguage() {
  const pack = window.stanfordUz;
  const button = document.querySelector('#lang-toggle');
  if (!pack || !button || typeof MutationObserver === 'undefined') return;
  const attributes = ['aria-label', 'alt', 'title', 'placeholder', 'content'];
  const cyrillic = /[А-Яа-яЁё]/;
  const texts = new Map();
  const attrs = new Map();
  let lang = 'ru';
  const translate = value => {
    const raw = value.trim();
    if (!raw) return value;
    let out = pack.strings[raw.replace(/\s+/g, ' ')];
    if (out === undefined) {
      for (const [pattern, build] of pack.patterns) {
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
    attrs.get(element)[name] = value;
    element.setAttribute(name, next);
  };
  const translateNode = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!cyrillic.test(node.data)) return;
      const next = translate(node.data);
      if (next !== node.data) { texts.set(node, node.data); node.data = next; }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    attributes.forEach(name => translateAttribute(node, name));
    node.childNodes.forEach(translateNode);
  };
  const restore = () => {
    texts.forEach((original, node) => { node.data = original; });
    attrs.forEach((values, element) => Object.entries(values).forEach(([name, value]) => element.setAttribute(name, value)));
    texts.clear();
    attrs.clear();
  };
  const observer = new MutationObserver(records => {
    if (lang !== 'uz') return;
    records.forEach(record => {
      if (record.type === 'childList') record.addedNodes.forEach(translateNode);
      else if (record.type === 'characterData') translateNode(record.target);
      else translateAttribute(record.target, record.attributeName);
    });
    observer.takeRecords(); // our own replacements need no second pass
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  const setLanguage = next => {
    lang = next;
    if (next === 'uz') translateNode(document.documentElement); else restore();
    document.documentElement.lang = next;
    button.textContent = next === 'uz' ? 'RU' : 'UZ';
    button.lang = next === 'uz' ? 'ru' : 'uz';
    button.setAttribute('aria-label', next === 'uz' ? 'Русский язык' : 'Özbek tili');
    observer.takeRecords();
  };
  button.addEventListener('click', () => {
    const next = lang === 'uz' ? 'ru' : 'uz';
    setLanguage(next);
    try { localStorage.setItem('stanford-lang', next); } catch { /* Keep the choice for this visit only. */ }
  });
  let saved;
  try { saved = localStorage.getItem('stanford-lang'); } catch { /* Settings are optional. */ }
  if (saved === 'uz') setLanguage('uz');
}
setupLanguage();
})();
