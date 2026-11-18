"""Students' reward for IELTS 9.0 and SAT 1600 is not announced yet (100 mln is the staff reward).

The headline names the largest announced amount; the two top tiers say «Сумма уточняется». Owner edits stay.
"""
from django.db import migrations


def forward(apps, schema_editor):
    apps.get_model('content', 'PageText').objects.filter(key='cashback.label2', text='? млн').update(text='15 млн')
    tiers = apps.get_model('content', 'CashbackTier').objects.filter(label='? млн сум')
    for exam, score in (('ielts', '9.0'), ('sat', '1600')):
        tiers.filter(exam=exam, score=score).update(label='Сумма уточняется')


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0021_english_translations'),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]
