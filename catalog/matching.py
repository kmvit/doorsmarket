"""
Сопоставление строки «Модель полотна» из КП с каталогом.

В КП модель пишут свободным текстом, вперемешку с характеристиками, номером
проёма и комментариями:

    Nord 1 ПО Милк ZB 810 EVO стекло прозрачное ДП1
    Полотно Piana 1 PG верт. 60мм (двухстворчатая) Д1 орех натуральный шпон
    SKY. Лицо -Грунт , Оборот-Зеркало серебро(обычное) . 65мм. ... Двухсторонняя Д5
    БЛОК 1. Piana 1 PG верт 50 мм. ... ЛИЦО: Орех натуральный, ОБОРОТ: Дуб натуральный

Поэтому мы не пытаемся угадать, «где здесь модель», а ищем в строке известные
названия из каталога — конечные списки моделей и цветов. Что не нашлось или
нашлось неоднозначно, уходит менеджеру в окно уточнения (п.5 ТЗ).

Модуль чистый: `match_model_name` работает над `CatalogIndex`, который можно
собрать как из БД (`build_index`), так и из обычных списков в тестах.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .normalize import normalize

# Маркеры сторон двусторонней двери. Нормализуем сразу — сравнивать
# приходится с нормализованным текстом.
_FRONT_MARKERS = [normalize(s) for s in ('лицо', 'лицевая сторона', 'лиц')]
_BACK_MARKERS = [normalize(s) for s in ('оборот', 'обратная сторона', 'тыл')]
_TWO_SIDED_MARKERS = [
    normalize(s) for s in (
        'двухсторонняя', 'двухсторонняя отделка', 'двусторонняя',
        'двусторонней отделкой', 'с двух сторон', 'с 2 сторон', 'с 2 х сторон',
    )
]

# Максимальный номер варианта полотна: в каталоге их единицы-десятки,
# число крупнее — это почти наверняка толщина или размер («50 мм», «65 мм»).
_MAX_NUMERIC_VARIANT = 40


@dataclass(frozen=True)
class CatalogEntry:
    """Запись справочника (модель или цвет) со всеми написаниями."""
    pk: int
    name: str
    norm_names: Tuple[str, ...]
    series_name: str = ''

    @classmethod
    def build(cls, pk: int, name: str, aliases=(), series_name: str = ''):
        norm_names = []
        for candidate in (name, *aliases):
            norm = normalize(candidate)
            if norm and norm not in norm_names:
                norm_names.append(norm)
        return cls(pk=pk, name=name, norm_names=tuple(norm_names), series_name=series_name)


@dataclass(frozen=True)
class Occurrence:
    """Найденное в строке вхождение записи справочника."""
    entry: CatalogEntry
    position: int
    length: int


@dataclass
class SideMatch:
    """Результат разбора одной стороны полотна (лицо или оборот)."""
    model: Optional[CatalogEntry] = None
    color: Optional[CatalogEntry] = None
    variant: str = ''
    image_pk: Optional[int] = None
    # Что мешает считать сторону распознанной; пусто — всё найдено.
    problems: List[str] = field(default_factory=list)
    # Варианты для окна уточнения.
    variant_options: List[str] = field(default_factory=list)

    @property
    def is_resolved(self) -> bool:
        return self.image_pk is not None and not self.problems

    def to_dict(self) -> Dict:
        return {
            'model_id': self.model.pk if self.model else None,
            'model_name': self.model.name if self.model else '',
            'series_name': self.model.series_name if self.model else '',
            'color_id': self.color.pk if self.color else None,
            'color_name': self.color.name if self.color else '',
            'variant': self.variant,
            'image_id': self.image_pk,
            'problems': list(self.problems),
            'variant_options': list(self.variant_options),
        }


@dataclass
class MatchResult:
    """Итог разбора одной позиции КП."""
    source_text: str
    front: SideMatch = field(default_factory=SideMatch)
    back: Optional[SideMatch] = None
    two_sided: bool = False

    @property
    def is_resolved(self) -> bool:
        if not self.front.is_resolved:
            return False
        return self.back.is_resolved if self.back else True

    @property
    def sides(self) -> List[SideMatch]:
        return [self.front] + ([self.back] if self.back else [])

    def to_dict(self) -> Dict:
        return {
            'source_text': self.source_text,
            'two_sided': self.two_sided,
            'resolved': self.is_resolved,
            'front': self.front.to_dict(),
            'back': self.back.to_dict() if self.back else None,
        }


class CatalogIndex:
    """
    Снимок каталога в памяти: модели, цвета и картинки по (модель, цвет).

    Каталог маленький (сотни записей), а разбирать нужно все позиции КП сразу,
    поэтому дешевле один раз загрузить всё в память, чем ходить в БД построчно.
    """

    def __init__(
        self,
        models: List[CatalogEntry],
        colors: List[CatalogEntry],
        images: Optional[Dict[Tuple[int, int], Dict[str, int]]] = None,
    ):
        # Длинные названия проверяем первыми: «Дуб антик» должен выиграть у «Дуб».
        self.models = sorted(models, key=lambda e: -max(len(n) for n in e.norm_names or ['']))
        self.colors = sorted(colors, key=lambda e: -max(len(n) for n in e.norm_names or ['']))
        # {(model_pk, color_pk): {variant: image_pk}}
        self.images = images or {}

    def variants_for(self, model_pk: int, color_pk: int) -> Dict[str, int]:
        return self.images.get((model_pk, color_pk), {})


def build_index() -> CatalogIndex:
    """Собирает индекс из БД."""
    from .models import DoorColor, DoorImage, DoorModel

    models = [
        CatalogEntry.build(m.pk, m.name, m.alias_list(), series_name=m.series.name)
        for m in DoorModel.objects.select_related('series').all()
    ]
    colors = [
        CatalogEntry.build(c.pk, c.name, c.alias_list())
        for c in DoorColor.objects.all()
    ]
    images: Dict[Tuple[int, int], Dict[str, int]] = {}
    for img in DoorImage.objects.all().only('id', 'door_model_id', 'color_id', 'variant'):
        images.setdefault((img.door_model_id, img.color_id), {})[img.variant] = img.pk
    return CatalogIndex(models, colors, images)


# ---------- поиск вхождений ----------

def _find_occurrences(padded_text: str, entries: List[CatalogEntry]) -> List[Occurrence]:
    """
    Все непересекающиеся вхождения записей справочника, длинные — в приоритете.

    `padded_text` — нормализованный текст, обрамлённый пробелами: так проверка
    границ слова сводится к обычному поиску подстроки ' название '.
    """
    occurrences: List[Occurrence] = []
    taken: List[Tuple[int, int]] = []

    for entry in entries:
        for norm_name in entry.norm_names:
            needle = f' {norm_name} '
            start = padded_text.find(needle)
            while start >= 0:
                span = (start, start + len(needle) - 1)
                if not any(span[0] < end and start_ < span[1] for start_, end in taken):
                    taken.append(span)
                    occurrences.append(
                        Occurrence(entry=entry, position=start, length=len(norm_name))
                    )
                # Хвостовой пробел needle общий с началом следующего слова —
                # ищем дальше от него, иначе пропустим смежные совпадения.
                start = padded_text.find(needle, span[1])

    return sorted(occurrences, key=lambda o: o.position)


def _dedupe_by_entry(occurrences: List[Occurrence]) -> List[Occurrence]:
    """Первое вхождение каждой записи справочника, в порядке появления."""
    seen = set()
    result = []
    for occ in occurrences:
        if occ.entry.pk in seen:
            continue
        seen.add(occ.entry.pk)
        result.append(occ)
    return result


def _marker_position(padded_text: str, markers: List[str]) -> int:
    """Позиция самого раннего из маркеров, либо -1."""
    positions = [
        pos for pos in (padded_text.find(f' {m} ') for m in markers if m) if pos >= 0
    ]
    return min(positions) if positions else -1


def _detect_variant(padded_text: str, variants, model_occurrence: Optional[Occurrence]) -> str:
    """
    Код варианта полотна, который упомянут в строке КП.

    Ищем не «какое-нибудь число рядом с моделью», а конкретные коды, которые
    есть у этой пары модель+цвет в каталоге, — так же, как модели и цвета.

      • артикул с буквами («AC36», «Torino TR 702») ищем где угодно в строке;
      • чисто числовой код («1», «12») принимаем только сразу за названием
        модели, иначе в него попадёт толщина полотна или размер проёма.
    """
    alnum_codes, numeric_codes = [], []
    for code in variants:
        if not code:
            continue
        (numeric_codes if code.isdigit() else alnum_codes).append(code)

    for code in sorted(alnum_codes, key=lambda c: -len(normalize(c))):
        if f' {normalize(code)} ' in padded_text:
            return code

    if model_occurrence is not None and numeric_codes:
        tail = padded_text[model_occurrence.position + model_occurrence.length + 1:].strip()
        token = tail.split(' ')[0] if tail else ''
        if token.isdigit() and 0 < int(token) <= _MAX_NUMERIC_VARIANT:
            for code in numeric_codes:
                if int(code) == int(token):
                    return code
    return ''


# ---------- сборка стороны ----------

def _resolve_image(
    side: SideMatch,
    index: CatalogIndex,
    padded_text: str,
    model_occurrence: Optional[Occurrence],
) -> None:
    """Доводит сторону до картинки либо заполняет `problems` для окна уточнения."""
    if side.model is None:
        side.problems.append('model_not_found')
    if side.color is None:
        side.problems.append('color_not_found')
    if side.model is None or side.color is None:
        return

    variants = index.variants_for(side.model.pk, side.color.pk)
    if not variants:
        side.problems.append('no_image_for_color')
        return

    side.variant_options = sorted(variants, key=lambda v: (len(v), v))
    side.variant = _detect_variant(padded_text, variants, model_occurrence)

    if side.variant:
        side.image_pk = variants[side.variant]
        return

    if len(variants) == 1:
        only_variant, image_pk = next(iter(variants.items()))
        side.variant = only_variant
        side.image_pk = image_pk
        return

    side.problems.append('variant_ambiguous')


def match_model_name(text: str, index: CatalogIndex) -> MatchResult:
    """
    Разбирает строку «Модель полотна» из КП: модель, цвет, вариант полотна,
    двусторонность. Ничего не выдумывает — что не нашлось в каталоге,
    отмечается в `problems` и уходит менеджеру на уточнение.
    """
    result = MatchResult(source_text=text or '')
    padded = f' {normalize(text)} '

    all_models = _find_occurrences(padded, index.models)
    all_colors = _find_occurrences(padded, index.colors)
    model_occurrences = _dedupe_by_entry(all_models)
    color_occurrences = _dedupe_by_entry(all_colors)

    front_pos = _marker_position(padded, _FRONT_MARKERS)
    back_pos = _marker_position(padded, _BACK_MARKERS)
    has_explicit_sides = front_pos >= 0 and back_pos > front_pos
    has_two_sided_marker = _marker_position(padded, _TWO_SIDED_MARKERS) >= 0

    if has_explicit_sides:
        # «ЛИЦО: Орех натуральный, ОБОРОТ: Дуб натуральный» — режем строку
        # по маркерам и разбираем каждую зону отдельно.
        # Дедуплицируем внутри зоны, а не по всей строке: цвет лица часто
        # назван и до маркеров тоже («Riga AC03 Белый матовый. Лицо -Белый
        # матовый, Оборот-Венге»), и глобальная дедупликация съела бы его.
        def in_zone(occurrences, start, end=None):
            return _dedupe_by_entry([
                o for o in occurrences
                if o.position >= start and (end is None or o.position < end)
            ])

        front_models = in_zone(all_models, front_pos, back_pos)
        back_models = in_zone(all_models, back_pos)
        front_colors = in_zone(all_colors, front_pos, back_pos)
        back_colors = in_zone(all_colors, back_pos)
        # Модель обычно пишут один раз до маркеров — она общая для обеих сторон.
        shared_models = in_zone(all_models, 0, front_pos)
        front_models = front_models or shared_models
        back_models = back_models or shared_models
        two_sided = True
    else:
        # Две разные модели или два разных цвета в одной строке = двусторонняя
        # дверь (п.6 ТЗ). Исключение — «Грунт с 2 сторон»: цвет один и тот же,
        # значит картинка тоже одна.
        two_sided = len(model_occurrences) > 1 or len(color_occurrences) > 1
        if has_two_sided_marker and len(color_occurrences) <= 1:
            two_sided = False
        front_models = model_occurrences[:1]
        back_models = model_occurrences[1:2] or model_occurrences[:1]
        front_colors = color_occurrences[:1]
        back_colors = color_occurrences[1:2]

    def build_side(models: List[Occurrence], colors: List[Occurrence]) -> SideMatch:
        model_occ = models[0] if models else None
        side = SideMatch(
            model=model_occ.entry if model_occ else None,
            color=colors[0].entry if colors else None,
        )
        _resolve_image(side, index, padded, model_occ)
        return side

    result.front = build_side(front_models, front_colors)
    result.two_sided = two_sided
    if two_sided:
        result.back = build_side(back_models, back_colors)
    return result


def match_order_items(items, index: Optional[CatalogIndex] = None) -> Dict[int, MatchResult]:
    """
    Разбирает позиции заказа пачкой: {order_item_id: MatchResult}.
    Индекс каталога загружается один раз на весь заказ.
    """
    index = index or build_index()
    return {item.pk: match_model_name(item.model_name, index) for item in items}
