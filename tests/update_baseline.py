"""Update tests/page_baseline.json after an intended change to the page's static text or links.

Python port of page()/normalize() from tests/design-system.test.mjs. Generated blocks
(<!-- NAME_START --> … <!-- NAME_END -->) are excluded, as in the test.

    python tests/update_baseline.py           # self-check and show the text difference
    python tests/update_baseline.py --write   # save the current index.html as the baseline
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
WS = r'[\s\u00a0\ufeff\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+'

def normalize(t):
    t = re.sub('[↗↘↙↖↑↓←→☰×◐☀\uFE0E]', '', t)
    return re.sub(WS, ' ', t).strip(' \t\n\r\f\v\u00a0\ufeff')

ENT = {'amp':'&','lt':'<','gt':'>','quot':'"','apos':"'",'nbsp':'\u00a0'}
def decode(t):
    def f(m):
        code = m.group(1)
        if not code.startswith('#'): return ENT[code.lower()]
        v = int(code[2:],16) if code[1].lower()=='x' else int(code[1:])
        return chr(v) if v <= 0x10ffff else m.group(0)
    return re.sub(r'&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);', f, t, flags=re.I)

def page(src):
    words, stack = [], []
    src = re.sub(r'<(script|style)\b[^>]*>[\s\S]*?</\1\s*>', '', src, flags=re.I)
    for tok in re.findall(r'<!--[\s\S]*?-->|<![^>]*>|</?[a-zA-Z][^>]*>|[^<]+', src):
        if tok.startswith('<!'): continue
        if tok.startswith('</'):
            tag = re.match(r'^</([\w-]+)', tok).group(1).lower()
            idx = max((i for i,n in enumerate(stack) if n['tag']==tag), default=-1)
            if idx != -1: del stack[idx:]
        elif tok.startswith('<'):
            tag = re.match(r'^<([\w-]+)', tok).group(1).lower()
            attrs = {m.group(1).lower(): decode(next((g for g in m.groups()[1:] if g is not None), ''))
                     for m in re.finditer(r'''([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?''', tok[len(tag)+1:])}
            ignored = any(n['ignored'] for n in stack) or tag=='svg' or attrs.get('aria-hidden')=='true' \
                or attrs.get('id') in ('theme-toggle','modal-close') or 'menu' in (attrs.get('class') or '').split()
            node = {'tag':tag,'ignored':ignored}
            if tag not in VOID and not tok.endswith('/>'): stack.append(node)
        elif not any(n['ignored'] for n in stack):
            words.append(decode(tok))
    return normalize(' '.join(words))

def strip_frame(src):
    src = re.sub(r'<!-- ([A-Z]+)_START -->[\s\S]*?<!-- \1_END -->', '', src)
    return re.sub(r'<!-- CONTACT_START:([a-z]+) -->[\s\S]*?<!-- CONTACT_END:\1 -->', '', src)

FRAME = True
path = ROOT/'tests/page_baseline.json'
data = json.loads(path.read_text(encoding='utf-8'))
assert page(strip_frame(data['index']) if FRAME else data['index']) == normalize(data['text']), 'SELF-CHECK FAILED: port does not reproduce old baseline'
print('self-check OK (old index -> old text exact)')
html = (ROOT/'index.html').read_text(encoding='utf-8').replace('\r\n','\n')
old_text = normalize(data['text'])
new_text = page(strip_frame(html))
if '--write' in sys.argv:
    data['index'] = html
    data['text'] = new_text
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8', newline='\n')
    print('baseline written')
import difflib
a, b = old_text.split(' '), new_text.split(' ')
for op in difflib.SequenceMatcher(None, a, b).get_opcodes():
    if op[0] != 'equal': print(op[0], '|', ' '.join(a[op[1]:op[2]]), '=>', ' '.join(b[op[3]:op[4]]))
