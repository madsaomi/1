"""The owner chose the 2026 Uzbek alphabet (ö, ğ, ş, ç) for the whole site: convert saved Uzbek translations.

English words and names stay as they are (content/uz_alphabet.py). Running it twice changes nothing.
"""
from django.db import migrations

from content.uz_alphabet import to_2026

FIELDS = {'Translation': ['uz'], 'PageText': ['uz'], 'Faq': ['question_uz', 'answer_uz']}


def forward(apps, schema_editor):
    for model_name, fields in FIELDS.items():
        for item in apps.get_model('content', model_name).objects.all():
            changed = [field for field in fields if to_2026(getattr(item, field)) != getattr(item, field)]
            for field in changed:
                setattr(item, field, to_2026(getattr(item, field)))
            if changed:
                item.save(update_fields=changed)


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0017_analytics_token'),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
