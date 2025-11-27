#!/usr/bin/env python3
"""
Скрипт для генерации VAPID ключей для Web Push уведомлений.

Использование:
    python generate_vapid_keys.py

Выведет публичный и приватный ключи в формате, готовом для .env файла.
"""

import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def base64_url_encode(data: bytes) -> str:
    """Конвертирует bytes в base64url строку (без padding)"""
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')


def generate_vapid_keys():
    """Генерирует новую пару VAPID ключей"""
    # Генерируем новую пару ключей ECDSA P-256
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()
    
    # Конвертируем приватный ключ в формат DER
    private_key_der = private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    # Конвертируем публичный ключ в нескомпрессированный формат (uncompressed point)
    # Это формат, который используется для VAPID
    public_key_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    
    # Конвертируем в base64url (формат для Web Push VAPID)
    public_key_b64 = base64_url_encode(public_key_bytes)
    private_key_b64 = base64_url_encode(private_key_der)
    
    print("=" * 60)
    print("VAPID Ключи сгенерированы!")
    print("=" * 60)
    print()
    print("Добавьте эти строки в ваш .env файл:")
    print()
    print(f"VAPID_PUBLIC_KEY={public_key_b64}")
    print(f"VAPID_PRIVATE_KEY={private_key_b64}")
    print()
    print("=" * 60)
    print("ВАЖНО:")
    print("- Публичный ключ (VAPID_PUBLIC_KEY) безопасен и может быть передан клиенту")
    print("- Приватный ключ (VAPID_PRIVATE_KEY) - СЕКРЕТНЫЙ, храните его в безопасности!")
    print("- Добавьте VAPID_PUBLIC_KEY в frontend/.env файл как VITE_VAPID_PUBLIC_KEY")
    print("=" * 60)
    
    return public_key_b64, private_key_b64


if __name__ == '__main__':
    try:
        generate_vapid_keys()
    except ImportError as e:
        print(f"Ошибка: Не установлена библиотека {e.name}")
        print("Установите её: pip install cryptography")
        exit(1)
    except Exception as e:
        print(f"Ошибка при генерации ключей: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
