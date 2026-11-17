"""Normalize uploads and start replaced/deleted-file retention at database commits."""
from django.db.models.signals import pre_save, post_save, pre_delete, post_delete

from .media import (prepare_gallery_video, prepare_instance_images, saved_instance_images,
                    deleted_instance_images, protect_deleted_instance_images)

pre_save.connect(prepare_gallery_video, dispatch_uid='content.normalize_videos', weak=False)
pre_save.connect(prepare_instance_images, dispatch_uid='content.normalize_images', weak=False)
post_save.connect(saved_instance_images, dispatch_uid='content.collect_replaced_images', weak=False)
post_delete.connect(deleted_instance_images, dispatch_uid='content.collect_deleted_images', weak=False)
pre_delete.connect(protect_deleted_instance_images, dispatch_uid='content.retain_deleted_images', weak=False)
