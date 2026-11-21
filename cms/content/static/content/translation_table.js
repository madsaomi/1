// Translation table: paste a block of cells from Excel / Google Sheets, mark changed cells, warn before leaving.
(() => {
  const form = document.querySelector('#translation-form');
  if (!form) return;
  const rows = [...form.querySelectorAll('tbody tr[data-row]')];
  const cells = rows.map(row => [...row.querySelectorAll('textarea')]);
  const counter = form.querySelector('.tt-changed');
  let dirty = false;

  const fit = area => { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight + 2, 320)}px`; };
  const markChanged = area => {
    area.classList.toggle('tt-changed-cell', area.value !== area.defaultValue);
    area.classList.toggle('tt-empty', !area.value.trim() && area.dataset.needs === 'true');
    const changed = form.querySelectorAll('.tt-changed-cell').length;
    dirty = changed > 0;
    counter.textContent = changed ? `Изменено ячеек: ${changed}` : '';
    fit(area);
  };

  // Spreadsheet text: rows by line breaks, columns by tabs; quoted cells may contain line breaks (Google Sheets).
  const parse = text => {
    const table = [[]];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"' && cell === '') quoted = true;
      else if (char === '\t') { table[table.length - 1].push(cell); cell = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[index + 1] === '\n') index++;
        table[table.length - 1].push(cell);
        cell = '';
        table.push([]);
      } else cell += char;
    }
    table[table.length - 1].push(cell);
    while (table.length > 1 && table[table.length - 1].every(value => value === '')) table.pop();
    return table;
  };

  cells.forEach((line, rowIndex) => line.forEach((area, columnIndex) => {
    fit(area);
    area.addEventListener('input', () => markChanged(area));
    area.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain') || '';
      if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return;
      event.preventDefault();
      parse(text).forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
        const target = cells[rowIndex + rowOffset]?.[columnIndex + columnOffset];
        if (!target) return;
        target.value = value.trim();
        markChanged(target);
      }));
    });
  }));

  form.querySelector('[data-copy-column="source"]')?.addEventListener('click', async event => {
    const text = rows.map(row => row.querySelector('.tt-text').textContent.replace(/\s+/g, ' ').trim()).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      event.currentTarget.textContent = `Скопировано строк: ${rows.length}`;
    } catch {
      event.currentTarget.textContent = 'Не удалось скопировать';
    }
  });

  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  form.addEventListener('submit', () => { dirty = false; });
  document.querySelectorAll('.tt-pages a, .tt-filters').forEach(element => element.addEventListener(element.tagName === 'FORM' ? 'submit' : 'click', event => {
    if (dirty && !confirm('Есть несохранённые переводы. Уйти без сохранения?')) event.preventDefault();
  }));
})();
