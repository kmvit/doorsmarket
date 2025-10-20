from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import User, City


class CitySerializer(serializers.ModelSerializer):
    """Сериализатор для городов"""
    class Meta:
        model = City
        fields = ['id', 'name']


class UserSerializer(serializers.ModelSerializer):
    """Сериализатор для пользователя"""
    city = CitySerializer(read_only=True)
    city_id = serializers.PrimaryKeyRelatedField(
        queryset=City.objects.all(),
        source='city',
        write_only=True,
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'role',
            'city',
            'city_id',
            'phone_number',
            'date_joined',
        ]
        read_only_fields = ['id', 'date_joined']


class RegisterSerializer(serializers.ModelSerializer):
    """Сериализатор для регистрации пользователя"""
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password2 = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    city_id = serializers.PrimaryKeyRelatedField(
        queryset=City.objects.all(),
        source='city',
        required=False,
        allow_null=True
    )
    
    class Meta:
        model = User
        fields = [
            'username',
            'email',
            'password',
            'password2',
            'first_name',
            'last_name',
            'role',
            'city_id',
            'phone_number',
        ]
        
    def validate(self, attrs):
        """Проверка совпадения паролей"""
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({
                "password": "Пароли не совпадают"
            })
        
        # Запрет создания администраторов через API регистрации
        if attrs.get('role') == 'admin':
            raise serializers.ValidationError({
                "role": "Невозможно зарегистрироваться с ролью администратора"
            })
        
        return attrs
    
    def create(self, validated_data):
        """Создание пользователя с хешированным паролем"""
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', User._meta.get_field('role').default),
            city=validated_data.get('city'),
            phone_number=validated_data.get('phone_number', '')
        )
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Сериализатор для смены пароля"""
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        validators=[validate_password]
    )
    new_password2 = serializers.CharField(required=True, write_only=True)
    
    def validate(self, attrs):
        """Проверка совпадения новых паролей"""
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({
                "new_password": "Пароли не совпадают"
            })
        return attrs

