"""
API справочника дверей.

Нужен окну уточнения модели и цвета в красивом КП (п.5 ТЗ) и загрузке
картинки со стороны, когда в каталоге её нет (п.7): менеджер выбирает
серию → модель → цвет → вариант полотна, либо грузит свою картинку,
и она сразу попадает в каталог — следующему заказу подберётся сама.
"""
from rest_framework import permissions, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from .models import DoorColor, DoorImage, DoorModel, DoorSeries
from .serializers import (
    DoorColorSerializer,
    DoorImageSerializer,
    DoorModelSerializer,
    DoorSeriesSerializer,
)


class DoorSeriesViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoorSeriesSerializer
    queryset = DoorSeries.objects.all()
    pagination_class = None


class DoorModelViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoorModelSerializer
    pagination_class = None

    def get_queryset(self):
        qs = DoorModel.objects.select_related('series')
        series_id = self.request.query_params.get('series')
        if series_id:
            qs = qs.filter(series_id=series_id)
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class DoorColorViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Цвета каталога. С `?door_model=<id>` — только те, в которых эта модель
    реально есть: показывать менеджеру цвета без картинок бессмысленно.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoorColorSerializer
    pagination_class = None

    def get_queryset(self):
        qs = DoorColor.objects.all()
        model_id = self.request.query_params.get('door_model')
        if model_id:
            qs = qs.filter(images__door_model_id=model_id).distinct()
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class DoorImageViewSet(viewsets.ModelViewSet):
    """
    Картинки полотен. Загрузка (POST) — это п.7 ТЗ: менеджер добавляет
    картинку, которой в каталоге не оказалось.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DoorImageSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = DoorImage.objects.select_related('door_model', 'door_model__series', 'color')
        model_id = self.request.query_params.get('door_model')
        if model_id:
            qs = qs.filter(door_model_id=model_id)
        color_id = self.request.query_params.get('color')
        if color_id:
            qs = qs.filter(color_id=color_id)
        return qs

    def perform_create(self, serializer):
        from .models import ImageSource
        serializer.save(source=ImageSource.MANUAL)
