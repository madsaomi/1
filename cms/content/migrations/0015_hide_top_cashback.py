"""The owner hides the top cashback amount for now: headline «Кэшбэк до ? млн сум…», IELTS 9.0 and SAT 1600 show «? млн сум».

Only the old published values change; anything the owner already edited in the admin stays.
"""
from django.db import migrations

OLD_HEADLINE, NEW_HEADLINE = '100 000 000', '? млн'
OLD_LABELS, NEW_LABEL = {'', '100 000 000 сум'}, '? млн сум'


def forward(apps, schema_editor):
    apps.get_model('content', 'PageText').objects.filter(key='cashback.label2', text=OLD_HEADLINE).update(text=NEW_HEADLINE)
    tiers = apps.get_model('content', 'CashbackTier').objects.filter(label__in=OLD_LABELS)
    for exam, score in (('ielts', '9.0'), ('sat', '1600')):
        tiers.filter(exam=exam, score=score).update(label=NEW_LABEL)


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0014_location_hours'),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
