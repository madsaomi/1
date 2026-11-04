"""Builds preview/demo.html: the real index.html plus placeholder blocks for owner review.

Not for publication: preview/ is git-ignored and outside the Docker context.
Run from anywhere: python preview/build_demo.py
"""
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
html = (HERE.parent / 'index.html').read_text(encoding='utf-8').replace('\r\n', '\n')


def replace_once(source, old, new):
    assert source.count(old) == 1, f'Anchor not found exactly once: {old[:60]}'
    return source.replace(old, new)


def svg(path, size=24):
    return (f'<svg class="icon" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
            f'<path d="{path}"/></svg>')


CAMERA = 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'
USER = 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'


def photo(label, hint, extra=''):
    return f'<div class="demo-photo{extra}" role="img" aria-label="Заглушка: {label}">{svg(CAMERA, 32)}<span>{label}</span><small>{hint}</small></div>'


# Local files resolve from preview/.
html = re.sub(r'(src|href)="(?!#|https?:|tel:|mailto:)([^"]+)"', r'\1="../\2"', html)
html = replace_once(html, '</head>', '  <link rel="stylesheet" href="demo.css">\n</head>')
html = replace_once(html, '<body id="top">', '<body id="top">\n  <p class="demo-banner"><strong>Демо-макет.</strong> Фото, цифры, преподаватели и отзывы — заглушки для показа дизайна. Не для публикации.</p>')

# Hero keeps the brand logo (PLAN-040); photos go to teachers, results and branches.

# Numbers strip right under the directions.
stats = [('20XX', 'год основания'), ('X XXX+', 'выпускников'), ('3', 'филиала в Нукусе'), ('XX', 'преподавателей')]
stats_html = ''.join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for value, label in stats)
html = replace_once(html, '<!-- HERO_END --></nav>\n    </div>\n',
                    '<!-- HERO_END --></nav>\n    </div>\n'
                    f'    <section class="wrap demo-stats" aria-label="Stanford в цифрах (заглушка)"><dl>{stats_html}</dl></section>\n')

# Teachers: real-looking cards with photo, score and experience.
teachers_start = html.index('        <p class="discount-note">Имена преподавателей')
teachers_end = html.index('      </section>', teachers_start)
teachers = [('General English · IELTS', 'IELTS 8.5', 'X лет опыта'), ('Kids English', 'CELTA', 'X лет опыта'),
            ('Немецкий язык', 'Goethe B2', 'X лет опыта'), ('Математика · SAT', 'SAT Math 780', 'X лет опыта')]
cards = ''.join(
    f'<article class="demo-teacher"><div class="demo-photo demo-portrait" role="img" aria-label="Заглушка: фото преподавателя">{svg(USER, 40)}<small>портрет 4:5</small></div>'
    f'<div class="demo-teacher-body"><h3>Имя Фамилия</h3><p>{role}</p><ul class="demo-chips"><li class="demo-chip-key">{score}</li><li>{years}</li></ul></div></article>'
    for role, score, years in teachers)
html = html[:teachers_start] + f'        <div class="demo-team">{cards}</div>\n' + html[teachers_end:]

# Student results before the exam details.
results = [('8.0', 'IELTS', 'C1'), ('7.5', 'IELTS', 'C1'), ('1450', 'SAT', 'из 1600')]
result_cards = ''.join(
    f'<article class="demo-result"><div class="demo-score"><strong>{score}</strong><span>{exam}</span><small>{level}</small></div>'
    '<blockquote>«Короткий отзыв студента: что дал курс и чем помог преподаватель. Две-три фразы.»</blockquote>'
    '<p class="demo-result-name">Имя Ф. · курс, срок обучения</p></article>'
    for score, exam, level in results)
html = replace_once(html, '      <section data-reveal class="section wrap exam-section" id="exams"',
                    '      <section class="section wrap demo-results" id="results" aria-labelledby="results-title">\n'
                    '        <div class="section-top"><h2 id="results-title">Результаты студентов</h2><p>Реальные баллы — с согласия студентов.</p></div>\n'
                    f'        <div class="demo-results-grid">{result_cards}</div>\n'
                    '      </section>\n'
                    '      <section data-reveal class="section wrap exam-section" id="exams"')

# Branch cards: entrance photo above each address.
html = html.replace('<article class="location-card"><h4>', '<article class="location-card">' + photo('Фото входа', 'чтобы легко найти', ' demo-entrance') + '<h4>')

(HERE / 'demo.html').write_text(html, encoding='utf-8', newline='\n')
print('preview/demo.html built')
