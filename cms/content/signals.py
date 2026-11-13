"""Normalize uploads and collect replaced files only after database commits."""
from django.db.models.signals import pre_save, post_save, post_delete

from .media import prepare_instance_images, saved_instance_images, deleted_instance_images

pre_save.connect(prepare_instance_images, dispatch_uid='content.normalize_images', weak=False)
post_save.connect(saved_instance_images, dispatch_uid='content.collect_replaced_images', weak=False)
post_delete.connect(deleted_instance_images, dispatch_uid='content.collect_deleted_images', weak=False)
