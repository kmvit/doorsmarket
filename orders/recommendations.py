"""
Алгоритмы для модуля «Замер».

Базовые правила (Excel-лист «рекомендации»):
  - Рек. дверь  = (проём.h - 70, проём.w - 100)
  - Рек. проём  = (двери.h + 70, двери.w + 100)

Текстовые рекомендации по проёму выводятся, когда фактическое отклонение
выходит за пороги:
  - высота: 60 мм или 80 мм
  - ширина: 90 мм или 105 мм
"""
from typing import Optional, Tuple, List, Dict, Any


# --- Базовые расчёты ---

def calculate_door_recommendation(
    opening_h: Optional[int],
    opening_w: Optional[int],
) -> Tuple[Optional[int], Optional[int]]:
    """
    Рекомендуемый размер двери по фактическому проёму.
    Дверь = проём - 70 (высота) / -100 (ширина).
    """
    rec_h = max(0, opening_h - 70) if opening_h else None
    rec_w = max(0, opening_w - 100) if opening_w else None
    return rec_h, rec_w


def calculate_opening_recommendation(
    door_h: Optional[int],
    door_w: Optional[int],
) -> Tuple[Optional[int], Optional[int]]:
    """
    Рекомендуемый размер проёма под существующую дверь.
    Проём = дверь + 70 (высота) / +100 (ширина).
    """
    rec_h = (door_h + 70) if door_h else None
    rec_w = (door_w + 100) if door_w else None
    return rec_h, rec_w


def calculate_opening_recommendation_with_desired(
    desired_h: Optional[int],
    desired_w: Optional[int],
    rec_door_h: Optional[int],
    rec_door_w: Optional[int],
) -> Tuple[Optional[int], Optional[int]]:
    """
    Рек. проём с учётом желаемого размера двери.
    Если СМ ввёл «желаемый размер двери» — считаем от него; иначе — от рассчитанной рек. двери.
    """
    h_source = desired_h or rec_door_h
    w_source = desired_w or rec_door_w
    return calculate_opening_recommendation(h_source, w_source)


# --- Текстовые рекомендации (Лист 7 ТЗ) ---

def build_recommendation_text(
    opening_h: Optional[int],
    opening_w: Optional[int],
    door_h: Optional[int],
    door_w: Optional[int],
) -> str:
    """
    Строит человекочитаемые рекомендации для проёма.
    Пороги по ТЗ (Лист 7):
        - высота: проём не превышает дверь на 60 мм → увеличить
        - высота: проём превышает дверь на 80 мм → уменьшить
        - ширина: проём не превышает дверь на 90 мм → увеличить
        - ширина: проём превышает дверь на 105 мм → уменьшить
    """
    parts: List[str] = []

    if opening_h is not None and door_h is not None:
        delta_h = opening_h - door_h
        if delta_h < 60:
            parts.append(
                f'Высота проёма ({opening_h} мм) недостаточна. '
                f'Увеличьте проём до {door_h + 70} (дверь +70) '
                f'или уменьшите дверь до {opening_h - 70} (проём −70).'
            )
        elif delta_h > 80:
            parts.append(
                f'Высота проёма ({opening_h} мм) избыточна. '
                f'Уменьшите проём до {door_h + 70} (дверь +70) '
                f'или увеличьте дверь до {opening_h - 70} (проём −70).'
            )

    if opening_w is not None and door_w is not None:
        delta_w = opening_w - door_w
        if delta_w < 90:
            parts.append(
                f'Ширина проёма ({opening_w} мм) недостаточна. '
                f'Увеличьте проём до {door_w + 100} (дверь +100) '
                f'или уменьшите дверь до {opening_w - 100} (проём −100).'
            )
        elif delta_w > 105:
            parts.append(
                f'Ширина проёма ({opening_w} мм) избыточна. '
                f'Уменьшите проём до {door_w + 100} (дверь +100) '
                f'или увеличьте дверь до {opening_w - 100} (проём −100).'
            )

    return ' '.join(parts)


# --- Валидации ---

def validate_lift_required(openings: List[Dict[str, Any]]) -> bool:
    """
    Если хотя бы один проём имеет высоту > 2300 — поле «лифт» обязательно.
    Возвращает True, если требуется указание лифта.
    """
    for op in openings:
        h = (
            op.get('actual_height')
            or op.get('desired_door_height')
            or op.get('recommended_door_height')
        )
        if h and int(h) > 2300:
            return True
    return False


INVERSO_TYPES = {'B_INVERSO', 'D_INVERSO'}


def validate_inverso_warning(opening_type: str) -> bool:
    """Для Inverso открываний — флаг для красного предупреждения."""
    return (opening_type or '').upper() in INVERSO_TYPES


def inverso_warning_text() -> str:
    """Текст предупреждения для Inverso."""
    return 'Inverso: увеличьте высоту полотна на 1 см.'


def lift_impossible_warning(lift_available, stairs_available) -> Optional[str]:
    """Если ни лифт, ни лестница не подходят — невозможен подъём."""
    if lift_available is False and stairs_available is False:
        return 'При данных размерах подъём невозможен.'
    return None
