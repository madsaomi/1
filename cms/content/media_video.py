"""Small, local-only video transcodes; originals are never retained in MEDIA_ROOT."""
import json
import math
import subprocess
import tempfile
from pathlib import Path

from django.core.exceptions import ValidationError

VIDEO_MAX_UPLOAD_BYTES = 30 * 1024 * 1024
VIDEO_MAX_BYTES = 8 * 1024 * 1024
VIDEO_MAX_SECONDS = 90
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm'}
VIDEO_ERROR = ('Не удалось прочитать видео. Выберите обычный MP4, MOV или WebM до 30 МБ '
               'и длительностью до 90 секунд.')


def _run(arguments, *, timeout):
    try:
        # Only the small, explicitly selected FFprobe JSON is needed. Decoder
        # stderr can contain arbitrary source strings and must not fill memory.
        return subprocess.run(arguments, check=True,
                              stdout=subprocess.PIPE if arguments[0] == 'ffprobe' else subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=timeout)
    except FileNotFoundError:
        raise ValidationError('Обработка видео недоступна: на сервере нужны FFmpeg и FFprobe.') from None
    except (subprocess.SubprocessError, OSError):
        # FFmpeg output may contain source metadata and must never reach a form or log.
        raise ValidationError(VIDEO_ERROR) from None


def _probe(path, container):
    args = ['ffprobe', '-v', 'error', '-max_alloc', '33554432', '-protocol_whitelist', 'file,pipe',
            '-format_whitelist', 'mov,matroska,webm', '-probesize', '5000000', '-analyzeduration', '5000000',
            '-f', container]
    if container == 'mov':
        args += ['-enable_drefs', '0', '-use_absolute_path', '0']
    args += ['-select_streams', 'v:0', '-show_entries', 'format=duration,nb_streams:stream=codec_type,width,height,duration',
             '-of', 'json', str(path)]
    result = _run(args, timeout=15)
    if len(result.stdout) > 64 * 1024:
        raise ValidationError(VIDEO_ERROR)
    try:
        info = json.loads(result.stdout)
        streams = info['streams']
        videos = [stream for stream in streams if stream.get('codec_type') == 'video']
        duration = float(info['format']['duration'])
        if (int(info['format'].get('nb_streams', len(streams))) > 8 or len(videos) != 1 or not math.isfinite(duration)
                or not 0 < duration <= VIDEO_MAX_SECONDS
                or not 2 <= int(videos[0]['width']) <= 3840
                or not 2 <= int(videos[0]['height']) <= 3840
                or int(videos[0]['width']) * int(videos[0]['height']) > 8_500_000):
            raise ValueError('Unsupported video dimensions, duration or streams.')
    except (ValueError, TypeError, KeyError, OverflowError):
        raise ValidationError(VIDEO_ERROR) from None
    return duration


def normalize_video(raw, filename='upload.mp4'):
    """Return (metadata-free H264/AAC MP4 bytes, compressed JPEG first frame)."""
    extension = Path(str(filename)).suffix.lower()
    if extension not in VIDEO_EXTENSIONS or not raw or len(raw) > VIDEO_MAX_UPLOAD_BYTES:
        raise ValidationError(VIDEO_ERROR)
    container = 'matroska' if extension == '.webm' else 'mov'
    with tempfile.TemporaryDirectory(prefix='stanford-video-') as temporary:
        root = Path(temporary)
        source, output, poster = root / ('source' + extension), root / 'clean.mp4', root / 'poster.jpg'
        source.write_bytes(raw)
        source_duration = _probe(source, container)
        args = ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-max_alloc', '33554432',
                '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm',
                '-probesize', '5000000', '-analyzeduration', '5000000', '-threads', '1', '-f', container]
        if container == 'mov':
            args += ['-enable_drefs', '0', '-use_absolute_path', '0']
        args += ['-i', str(source), '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
                 '-map_metadata', '-1', '-map_chapters', '-1', '-t', str(VIDEO_MAX_SECONDS),
                 '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
                 '-filter_threads', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '29',
                 '-maxrate', '600k', '-bufsize', '1200k', '-pix_fmt', 'yuv420p', '-threads', '1',
                 '-c:a', 'aac', '-b:a', '64k', '-ac', '2', '-ar', '44100',
                 '-movflags', '+faststart', '-f', 'mp4', '-fs', str(VIDEO_MAX_BYTES), str(output)]
        _run(args, timeout=120)
        if not output.is_file() or not 0 < output.stat().st_size <= VIDEO_MAX_BYTES:
            raise ValidationError('Сжатое видео больше 8 МБ. Сократите ролик и загрузите снова.')
        clean_duration = _probe(output, 'mov')
        # -fs is a final disk ceiling, never permission to silently truncate a clip.
        if clean_duration + .25 < source_duration:
            raise ValidationError('Видео не помещается в 8 МБ целиком. Сократите ролик и загрузите снова.')
        _run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe',
              '-threads', '1', '-i', str(output), '-map', '0:v:0', '-frames:v', '1', '-an', '-sn', '-dn',
              '-map_metadata', '-1', '-vf', "scale='min(640,iw)':'min(640,ih)':force_original_aspect_ratio=decrease",
              '-filter_threads', '1', '-threads', '1', str(poster)], timeout=20)
        from .media import normalize_image
        return output.read_bytes(), normalize_image(poster.read_bytes())


def normalized_video_upload(upload):
    """Cache form validation's expensive transcode on the same temporary upload."""
    cached = getattr(upload, '_stanford_normalized_video', None)
    if cached is not None:
        return cached
    position = upload.tell()
    try:
        upload.seek(0)
        raw = upload.read(VIDEO_MAX_UPLOAD_BYTES + 1)
        result = normalize_video(raw, upload.name)
        upload._stanford_normalized_video = result
        return result
    finally:
        upload.seek(position)
