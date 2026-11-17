"""Uzbek Latin in the 2026 spelling the site uses: oʻ → ö, gʻ → ğ, sh → ş, ch → ç.

The owner chose one alphabet for the whole site. English words and names (General English, Teaching Knowledge
Test, Stanford) are left as they are; the tutuq belgisi (maʼlumot) stays and is written with ʼ.
"""
import re

# Words that are English or names, kept exactly.
KEEP = {'english', 'englishdan', 'teaching', 'speaking', 'school', 'research', 'match', 'coach', 'chat', 'cash',
        'cashback', 'push', 'sheets', 'shop', 'stanford', 'nukus', 'telegram', 'ielts', 'sat', 'which', 'each',
        'such', 'much', 'touch', 'tech', 'chemistry', 'english-speaking', 'children', 'teacher', 'teachers',
        'speech', 'approach', 'lunch', 'fresh', 'british', 'dashboard', 'whatsapp', 'tashkent'}
APOSTROPHES = '‘’ʻ\'`'
WORD = re.compile(r"[A-Za-zÀ-ɏ" + re.escape(APOSTROPHES) + r"ʼ]+")
SWAPS = [(re.compile(rf'([Oo])[{re.escape(APOSTROPHES)}]'), lambda m: 'Ö' if m[1] == 'O' else 'ö'),
         (re.compile(rf'([Gg])[{re.escape(APOSTROPHES)}]'), lambda m: 'Ğ' if m[1] == 'G' else 'ğ'),
         (re.compile(r'(S[Hh]|sh)'), lambda m: 'Ş' if m[1][0] == 'S' else 'ş'),
         (re.compile(r'(C[Hh]|ch)'), lambda m: 'Ç' if m[1][0] == 'C' else 'ç')]


def _word(match):
    word = match[0]
    if word == 'Sh':  # «Du–Sh»: the short form of Shanba (Saturday)
        return 'Şa'
    if word.lower().strip(APOSTROPHES) in KEEP:
        return word
    for pattern, replace in SWAPS:
        word = pattern.sub(replace, word)
    # The remaining apostrophe is the tutuq belgisi: one sign everywhere.
    return re.sub(rf'(?<=[A-Za-zÀ-ɏ])[{re.escape(APOSTROPHES)}](?=[A-Za-zÀ-ɏ])', 'ʼ', word)


def to_2026(text):
    """Convert Uzbek text; text without Latin letters comes back unchanged."""
    if not text:
        return text
    return WORD.sub(_word, text)
