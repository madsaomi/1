"""The owner renamed «Языковой центр» to «Учебный центр» (UZ «Öquv markazi», QQ «Oqıw orayı»).

Only values that still hold the old wording (or are empty) change, so later edits in the admin are never overwritten.
"""
from django.db import migrations

OLD_TEXT, NEW_TEXT = 'Языковой центр', 'Учебный центр'
OLD = {'uz': {'', 'Til markazi', 'Nukusdagi til markazi'}, 'kaa': {'', 'Til orayı', 'Nókistegi til orayı'}}
NEW = {
    'Учебный центр': {'uz': 'Öquv markazi', 'kaa': 'Oqıw orayı'},
    'Учебный центр в Нукусе': {'uz': 'Nukusdagi öquv markazi', 'kaa': 'Nókistegi oqıw orayı'},
}
SAME = {'Языковой центр': 'Учебный центр', 'Языковой центр в Нукусе': 'Учебный центр в Нукусе'}


def refresh(item, values):
    changed = [lang for lang, value in values.items() if getattr(item, lang).strip() in OLD[lang] and getattr(item, lang) != value]
    for lang in changed:
        setattr(item, lang, values[lang])
    return changed


def forward(apps, schema_editor):
    PageText = apps.get_model('content', 'PageText')
    Translation = apps.get_model('content', 'Translation')
    for item in PageText.objects.filter(text__in=[OLD_TEXT, NEW_TEXT]):
        fields = []
        if item.text == OLD_TEXT:
            item.text = NEW_TEXT
            fields.append('text')
        fields += refresh(item, NEW[NEW_TEXT])
        if fields:
            item.save(update_fields=fields)
    for source, target in SAME.items():
        old = Translation.objects.filter(source=source).first()
        if old is None:
            continue  # a fresh database gets the dictionary from the site files instead
        new = Translation.objects.filter(source=target).first() or Translation(source=target, uz='', kaa='')
        for item in (old, new):
            fields = refresh(item, NEW[target])
            if item.pk is None:
                item.save()
            elif fields:
                item.save(update_fields=fields)


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0012_media_gallery'),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
