from typing import Any, Dict, Iterable, List

from django.db import transaction

from .models import TaskRecord
from .task_builder import build_tasks_from_analysis


def _list_value(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return list(value)


def _task_needs_update(existing: TaskRecord, payload: Dict[str, Any]) -> bool:
    return any([
        existing.run_id != (payload.get('run').id if payload.get('run') else None),
        existing.sheet_name != payload.get('sheet_name', ''),
        existing.title != payload.get('title', ''),
        existing.task_type != payload.get('task_type', ''),
        existing.priority != payload.get('priority', ''),
        existing.status != payload.get('status', ''),
        existing.timeframe != payload.get('timeframe', ''),
        existing.description != payload.get('description', ''),
        existing.action != payload.get('action', ''),
        _list_value(existing.action_options) != _list_value(payload.get('action_options')),
        _list_value(existing.product_actions) != _list_value(payload.get('product_actions')),
        int(existing.confidence) != int(payload.get('confidence', 0)),
        existing.source != payload.get('source', 'analysis'),
    ])


def sync_task_records_for_upload(upload, analysis: Dict[str, Any]) -> int:
    if not upload or not isinstance(analysis, dict):
        return 0

    tasks = build_tasks_from_analysis(analysis)
    if tasks is None:
        tasks = []

    sheet_id = int(upload.id)
    sheet_name = upload.uploaded_sheet_name or ''

    with transaction.atomic():
        existing = TaskRecord.objects.filter(sheet_id=sheet_id)
        existing_map = {task.task_key: task for task in existing}
        incoming_keys = set()
        created = 0
        updated = 0

        for task in tasks:
            task_key = task.get('task_key')
            if not task_key:
                # If key is missing, derive it from unique components
                task_key = f"{task.get('task_type')}-{task.get('title')}"
            
            # Prevent empty keys and force uniqueness for incoming batch
            if not task_key or task_key in incoming_keys:
                continue
            
            incoming_keys.add(task_key)

            payload = {
                'run': upload,
                'sheet_id': sheet_id,
                'sheet_name': sheet_name,
                'task_key': task_key,
                'title': task.get('title', ''),
                'task_type': task.get('task_type', ''),
                'priority': task.get('priority', ''),
                'status': task.get('status', ''),
                'timeframe': task.get('timeframe', ''),
                'description': task.get('description', ''),
                'action': task.get('action', ''),
                'action_options': _list_value(task.get('action_options')),
                'product_actions': _list_value(task.get('product_actions')),
                'confidence': int(task.get('confidence', 0)),
                'source': task.get('source', 'analysis'),
            }

            existing_task = existing_map.get(task_key)
            if existing_task:
                if _task_needs_update(existing_task, payload):
                    for field, value in payload.items():
                        setattr(existing_task, field, value)
                    existing_task.save(update_fields=[
                        'run',
                        'sheet_name',
                        'title',
                        'task_type',
                        'priority',
                        'status',
                        'timeframe',
                        'description',
                        'action',
                        'action_options',
                        'product_actions',
                        'confidence',
                        'source',
                        'updated_at',
                    ])
                    updated += 1
            else:
                TaskRecord.objects.create(**payload)
                created += 1

        stale_keys = set(existing_map.keys()) - incoming_keys
        if stale_keys:
            TaskRecord.objects.filter(sheet_id=sheet_id, task_key__in=stale_keys).delete()

    return created + updated
