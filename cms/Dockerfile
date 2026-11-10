# Hidden content admin (PLAN-044 stage 5). Build from the cms/ directory:
#   docker build -t stanford-cms cms/
# On Railway: service root directory = cms, Dockerfile = Dockerfile.
FROM node:22-bookworm-slim AS node-runtime
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

# The admin builds the current GitHub snapshot in a temporary directory on publication.
# Only Node itself is needed; browser assets and sources are fetched from that pinned commit.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 gosu \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY entrypoint.sh /usr/local/bin/stanford-entrypoint

# collectstatic only needs settings, not a database: run it with the local defaults, then fix ownership.
RUN DJANGO_LOCAL=1 python manage.py collectstatic --noinput --clear \
    && useradd --create-home --uid 10001 app \
    && mkdir -p /app/media \
    && chown -R app:app /app \
    && chmod 0755 /usr/local/bin/stanford-entrypoint

# Root only initializes the fixed volume, then the entrypoint execs the command as app.
USER root
ENTRYPOINT ["/usr/local/bin/stanford-entrypoint"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD gosu app python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/healthz', timeout=4)"

# Production settings take over here: DJANGO_LOCAL must not be set in the Railway variables.
CMD ["sh", "-c", "DJANGO_LOCAL=0 exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 300 --access-logfile -"]
