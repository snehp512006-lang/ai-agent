from django.db import models


class Sheet(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        PUBLISHED = 'PUBLISHED', 'Published'
        RESTORE = 'RESTORE', 'Restore'
        DELETE = 'DELETE', 'Delete'

    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, related_name='sheets')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    sheet_size = models.BigIntegerField(default=0)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.status})"


class RecycleBinSheet(models.Model):
    class Action(models.TextChoices):
        DELETE = 'DELETE', 'Delete'
        RESTORE = 'RESTORE', 'Restore'

    sheet = models.OneToOneField(
        Sheet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recycle_record',
    )
    sheet_id_snapshot = models.BigIntegerField(null=True, blank=True, db_index=True)
    sheet_name = models.CharField(max_length=255)
    action = models.CharField(max_length=20, choices=Action.choices, default=Action.DELETE)
    action_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='sheet_recycle_actions')
    deleted_at = models.DateTimeField(auto_now_add=True)
    restored_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-deleted_at']


class DataCleanerRun(models.Model):
    class AnalysisStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        PROCESSING = 'PROCESSING', 'Processing'
        MAPPED = 'MAPPED', 'Mapped — Awaiting Confirmation'
        COMPLETED = 'COMPLETED', 'Completed'
        SUCCESS = 'SUCCESS', 'Analysis Success'
        FAILED = 'FAILED', 'Analysis Fail'
        REANALYSIS = 'REANALYSIS', 'Reanalysis'

    uploaded_sheet_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10)  # csv, xlsx, json
    file_hash = models.CharField(max_length=64, blank=True, db_index=True)
    uploaded_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='cleaner_uploads')
    analysis_status = models.CharField(max_length=20, choices=AnalysisStatus.choices, default=AnalysisStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.uploaded_sheet_name} [{self.analysis_status}]"

    class Meta:
        ordering = ['-id']
        indexes = [
            models.Index(fields=['uploaded_by', '-id'], name='dcrun_user_id_desc_idx'),
            models.Index(fields=['analysis_status', '-id'], name='dcrun_status_id_desc_idx'),
            models.Index(fields=['file_hash', 'analysis_status'], name='dcrun_hash_status_idx'),
        ]


class DataCleanerRunPayload(models.Model):
    run = models.OneToOneField(DataCleanerRun, on_delete=models.CASCADE, related_name='payload')
    raw_data = models.JSONField(null=True, blank=True)
    analysis_snapshot = models.JSONField(default=dict, blank=True)
    processing_summary = models.JSONField(default=dict, blank=True)
    processed_rows = models.IntegerField(default=0)
    last_processed_at = models.DateTimeField(null=True, blank=True)
    error_log = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f"Payload for run {self.run_id}"


class TaskRecord(models.Model):
    run = models.ForeignKey(DataCleanerRun, on_delete=models.SET_NULL, null=True, blank=True, related_name='task_records')
    sheet_id = models.BigIntegerField(db_index=True)
    sheet_name = models.CharField(max_length=255, blank=True)
    task_key = models.CharField(max_length=255)
    title = models.CharField(max_length=255)
    task_type = models.CharField(max_length=32)
    priority = models.CharField(max_length=16)
    status = models.CharField(max_length=16)
    timeframe = models.CharField(max_length=16)
    description = models.TextField(blank=True)
    action = models.TextField(blank=True)
    action_options = models.JSONField(default=list, blank=True)
    product_actions = models.JSONField(default=list, blank=True)
    confidence = models.IntegerField(default=0)
    source = models.CharField(max_length=32, default='analysis')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['sheet_id', 'task_key'], name='unique_task_per_sheet'),
        ]
        indexes = [
            models.Index(fields=['sheet_id', 'task_type'], name='taskrecord_sheet_type_idx'),
        ]

    def __str__(self):
        return f"{self.task_type} - {self.title}"
