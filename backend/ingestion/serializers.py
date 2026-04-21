from rest_framework import serializers
from .models import Sheet, RecycleBinSheet, DataCleanerRun

class SheetSerializer(serializers.ModelSerializer):
    # Frontend compatibility: treat ARCHIVED as DELETE in storage.
    status = serializers.CharField(required=False)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = Sheet
        fields = ['id', 'name', 'status', 'sheet_size', 'created_by', 'created_by_username', 'created_at', 'updated_at']
        read_only_fields = ['created_by', 'sheet_size', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        if isinstance(data, dict):
            allowed = {'name', 'status'}
            data = {key: value for key, value in data.items() if key in allowed}
        return super().to_internal_value(data)

    def validate_status(self, value):
        raw = str(value or '').upper()
        if raw == 'ARCHIVED':
            return Sheet.Status.DELETE
        if raw in {Sheet.Status.DRAFT, Sheet.Status.PUBLISHED, Sheet.Status.RESTORE, Sheet.Status.DELETE}:
            return raw
        raise serializers.ValidationError('Invalid status value.')

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        if instance.status == Sheet.Status.DELETE:
            payload['status'] = 'ARCHIVED'
        payload['date'] = instance.updated_at.isoformat() if instance.updated_at else None
        payload['version'] = 'v1.0'
        return payload


class RecycleBinSheetSerializer(serializers.ModelSerializer):
    sheet_id = serializers.SerializerMethodField()
    action_by_username = serializers.CharField(source='action_by.username', read_only=True)

    def get_sheet_id(self, obj):
        return obj.sheet_id or obj.sheet_id_snapshot

    class Meta:
        model = RecycleBinSheet
        fields = ['id', 'sheet_id', 'sheet_name', 'action', 'action_by', 'action_by_username', 'deleted_at', 'restored_at']


class DataCleanerRunSerializer(serializers.ModelSerializer):
    upload_id = serializers.IntegerField(source='id', read_only=True)
    sheet_id = serializers.IntegerField(source='id', read_only=True)
    sheet_name = serializers.CharField(source='uploaded_sheet_name', read_only=True)
    status = serializers.CharField(source='analysis_status', read_only=True)
    uploaded_by_username = serializers.CharField(source='uploaded_by.username', read_only=True)
    analysis = serializers.SerializerMethodField()
    processing_summary = serializers.SerializerMethodField()
    processed_rows = serializers.SerializerMethodField()

    def get_analysis(self, obj):
        include_analysis = bool(self.context.get('include_analysis', False))
        if not include_analysis:
            return None

        payload = getattr(obj, 'payload', None)
        snapshot = getattr(payload, 'analysis_snapshot', None)
        if not isinstance(snapshot, dict):
            return None
        return {
            'forecast_summary': snapshot.get('forecast_summary'),
            'sales_summary': snapshot.get('sales_summary'),
            'confidence_score': snapshot.get('confidence_score'),
            'recommendations': snapshot.get('recommendations'),
            'analysis_isolation': snapshot.get('analysis_isolation'),
            'sheet_analysis': snapshot.get('sheet_analysis'),
            'metadata': snapshot.get('metadata'),
        }

    def get_processing_summary(self, obj):
        payload = getattr(obj, 'payload', None)
        summary = getattr(payload, 'processing_summary', None)
        return summary if isinstance(summary, dict) else {}

    def get_processed_rows(self, obj):
        payload = getattr(obj, 'payload', None)
        processed = getattr(payload, 'processed_rows', None)
        return processed if processed is not None else 0

    class Meta:
        model = DataCleanerRun
        fields = [
            'id',
            'upload_id',
            'sheet_id',
            'uploaded_sheet_name',
            'sheet_name',
            'file_type',
            'uploaded_by',
            'uploaded_by_username',
            'analysis_status',
            'status',
            'completed_at',
            'analysis',
            'processing_summary',
            'processed_rows',
        ]

