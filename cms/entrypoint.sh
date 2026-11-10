#!/bin/sh
set -eu

# Railway mounts a fresh volume as root. Only this fixed media directory may
# receive ownership changes; application commands always run as uid 10001.
media_root=/app/media
fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

[ "${MEDIA_ROOT:-$media_root}" = "$media_root" ] || fail 'MEDIA_ROOT must be /app/media in this image.'
[ ! -L /app ] && [ ! -L "$media_root" ] || fail 'The media directory must not be a symlink.'
[ "$#" -gt 0 ] || fail 'No application command was supplied.'

if [ "$(id -u)" = 0 ]; then
    mkdir -p "$media_root"
    if find "$media_root" -xdev -type l -print -quit | grep -q .; then
        fail 'Symlinks are not allowed inside the media directory.'
    fi
    # Physical traversal and -h prevent ownership changes through symlinks.
    find "$media_root" -xdev -exec chown -h app:app {} +
    chmod u+rwx "$media_root"
    exec /usr/sbin/gosu app "$@"
fi

[ "$(id -u)" = 10001 ] || fail 'Application commands must run as uid 10001.'
[ -d "$media_root" ] && [ -w "$media_root" ] || fail 'The media directory is not writable by uid 10001.'
if find "$media_root" -xdev -type l -print -quit | grep -q .; then
    fail 'Symlinks are not allowed inside the media directory.'
fi
exec "$@"
