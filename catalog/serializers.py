from rest_framework import serializers

from .models import DoorColor, DoorImage, DoorModel, DoorSeries


class DoorSeriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoorSeries
        fields = ['id', 'name']


class DoorModelSerializer(serializers.ModelSerializer):
    series_name = serializers.CharField(source='series.name', read_only=True)

    class Meta:
        model = DoorModel
        fields = ['id', 'name', 'series', 'series_name', 'aliases']


class DoorColorSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoorColor
        fields = ['id', 'name', 'aliases']


class DoorImageSerializer(serializers.ModelSerializer):
    """Картинка полотна вместе с подписью, по которой её узнаёт менеджер."""
    model_name = serializers.CharField(source='door_model.name', read_only=True)
    color_name = serializers.CharField(source='color.name', read_only=True)
    series_name = serializers.CharField(source='door_model.series.name', read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = DoorImage
        fields = [
            'id', 'door_model', 'model_name', 'series_name',
            'color', 'color_name', 'variant', 'image', 'image_url', 'source',
        ]
        extra_kwargs = {'image': {'write_only': True}}

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url
