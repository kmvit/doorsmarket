"""
Парсер PDF коммерческих предложений (КП) для модуля «Заказы и Замеры».

Формат КП — типовой «Приложение №1 (Счет-Заказ)». Файл разбит на секции:
  • Модель полотна       → OrderItem (двери и стеновые панели)
  • Дверной короб        → OrderItemAddon kind=box        (привязка по open_type)
  • Наличник             → OrderItemAddon kind=platband   (общий)
  • Добор                → OrderItemAddon kind=extension  (общий)
  • Петли                → OrderItemAddon kind=hinges     (общий)
  • Ручки + накладки     → OrderItemAddon kind=handle     (общий)
  • Механизмы            → OrderItemAddon kind=mechanism  (общий)
  • Стекло               → OrderItemAddon kind=glass      (общий)
  • Доп. к заказу        → OrderItemAddon kind=extra      (общий)
  • Услуги               → OrderItemAddon kind=service    (общий)

Шапка (клиент / телефон / адрес / № КП / дата / менеджер) парсится через
helpers из projects.pdf_parser — формат документов идентичен рекламациям.
"""
import re
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

import pdfplumber

from projects.pdf_parser import (
    _extract_address,
    _extract_client_name as _extract_client_name_legacy,
    _extract_contact_phone as _extract_contact_phone_legacy,
    _extract_manager_name,
    _extract_order_number,
)


def _extract_contact_phone(text: str) -> str:
    """
    Телефон клиента ищем только в зоне «Покупатель … до Комментарий/Стоимость»,
    чтобы не подхватывать телефон салона из строки «Подразделение г.X ... тел ...».
    Если в этой зоне номера нет — возвращаем пусто (а не первый попавшийся).
    """
    # Зона: от «Покупатель» (либо «Телефоны») до «Комментарий»/«Стоимость»/«Модель полотна»
    start_match = re.search(r'покупатель', text, re.IGNORECASE)
    start = start_match.start() if start_match else 0
    end_match = re.search(
        r'комментарий|стоимость\s+товара|модель\s+полотна',
        text[start:], re.IGNORECASE,
    )
    end = (start + end_match.start()) if end_match else len(text)
    zone = text[start:end]
    phone = _extract_contact_phone_legacy(zone)
    return phone


def _extract_client_name(text: str) -> str:
    """
    Локальная версия с поддержкой инициалов и точек ('Салихов М.И. ЖК УНО').
    Сначала пробуем точный паттерн с точками, fallback — на legacy парсер.
    """
    patterns = [
        # «Покупатель (Ф.И.О.) <ИМЯ_С_ИНИЦИАЛАМИ_И_АББРЕВИАТУРОЙ>» до следующего поля шапки
        r'покупатель\s*\([^\)]*\)\s*([А-ЯЁA-Z][А-Яа-яёA-Za-z0-9\.\s\-«»"\']+?)\s*(?=Адрес|Телефон|Email|Подразделение|Менеджер|Комментарий)',
        r'покупатель\s*[:\-]?\s*([А-ЯЁA-Z][А-Яа-яёA-Za-z0-9\.\s\-«»"\']+?)\s*(?=Адрес|Телефон|Email|Подразделение|Менеджер|Комментарий)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip().rstrip(',.;')
            # Срезаем хвост, если он попал из соседнего поля
            name = re.sub(r'\s+', ' ', name)
            if 2 <= len(name) <= 200:
                return name
    return _extract_client_name_legacy(text)

logger = logging.getLogger(__name__)


# ---------- маркеры секций ----------

SECTION_PATTERNS: List[Tuple[str, re.Pattern]] = [
    # Все паттерны привязаны к началу строки и требуют полного заголовка секции
    # (включая хвост «Кол-во …» или «(модель/артикул)»), чтобы не матчиться
    # на слова из описания позиций («петли», «короб» и т.п.).
    ('doors', re.compile(r'^Модель\s+полотна\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('box', re.compile(r'^Дверной\s+короб\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('platband', re.compile(r'^Наличник\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('extension', re.compile(r'^Добор\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('hinges', re.compile(r'^Петли\s*\(\s*модель', re.IGNORECASE | re.MULTILINE)),
    ('handle', re.compile(r'^Ручки\s*\+\s*накладки', re.IGNORECASE | re.MULTILINE)),
    ('mechanism', re.compile(r'^Механизмы\s*\(\s*вид', re.IGNORECASE | re.MULTILINE)),
    ('glass', re.compile(r'^Стекло\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('extra', re.compile(r'^Доп\.\s*к\s*заказу\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
    ('service', re.compile(r'^Услуги\s+Кол-во', re.IGNORECASE | re.MULTILINE)),
]

ADDON_KIND_BY_SECTION = {
    'box': 'box',
    'platband': 'platband',
    'extension': 'extension',
    'hinges': 'hinges',
    'handle': 'handle',
    'mechanism': 'mechanism',
    'glass': 'glass',
    'extra': 'extra',
    'service': 'service',
}

END_MARKER = re.compile(
    r'Стоимость\s+товара\s*:|Стоимость\s+стекла\s*:|^Способ\s+оплаты',
    re.IGNORECASE | re.MULTILINE,
)

# ---------- регулярки на размеры / открывания ----------

SIZE_RE = re.compile(r'(\d+)(?:полотно)?\s*\*\s*(\d+)')
TWO_SIZES_RE = re.compile(r'(\d+(?:полотно)?\s*\*\s*\d+)\s+(\d+\s*\*\s*\d+)')

# Открывания: A/B/C/D + опциональный INVERSO. Кириллические тоже считаем.
OPENING_RE = re.compile(
    r'\b([A-DА-Д])\s*[\-,]?\s*(?:Inverso|INVERSO|Инверсо|ИНВЕРСО)?',
    re.IGNORECASE,
)

# ---------- вспомогательные ----------

def _to_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    digits = re.sub(r'[^\d]', '', str(value))
    return int(digits) if digits else None


def _to_decimal(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    cleaned = re.sub(r'[^\d,\.]', '', str(value)).replace(',', '.')
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _normalize_opening_token(text: str) -> str:
    """
    Возвращает один из A/B/B_INVERSO/C/D/D_INVERSO либо ''.
    Принимает строки вида: 'А- правое', 'B ИНВЕРСО', 'D Инверсо', 'С , с врезкой', 'A'.
    Поддерживаем кириллические А/В/С (U+0410, U+0412, U+0421) и латинские A/B/C/D.
    """
    if not text:
        return ''
    has_inverso = bool(re.search(r'inverso|инверсо', text, re.IGNORECASE))
    # Явный список: латинские A/B/C/D и кириллические А/В/С
    m = re.search(r'(?<![A-Za-zА-Яа-я])([ABCDАВС])(?![A-Za-zА-Яа-я])', text, re.IGNORECASE)
    if not m:
        return ''
    letter = m.group(1).upper()
    cyrillic_map = {'А': 'A', 'В': 'B', 'С': 'C'}
    letter = cyrillic_map.get(letter, letter)
    if letter not in ('A', 'B', 'C', 'D'):
        return ''
    if has_inverso and letter in ('B', 'D'):
        return f'{letter}_INVERSO'
    return letter


def _detect_door_type(text: str) -> str:
    """Простая эвристика: если в описании 'входн' — entrance, иначе interior."""
    lowered = (text or '').lower()
    if 'входн' in lowered:
        return 'entrance'
    if any(kw in lowered for kw in ('межкомнат', 'piana', 'opera', 'sky', 'wave', 'полотно')):
        return 'interior'
    return ''


def _extract_room_from_description(desc: str) -> str:
    """Достаёт название помещения из круглых скобок: '... ( Спальня2)' → 'Спальня2'."""
    if not desc:
        return ''
    matches = re.findall(r'\(([^()]+)\)', desc)
    for m in matches:
        text = m.strip()
        if not text or text.lower().startswith(('ключ', 'модель', 'артикул', 'мод', 'для')):
            continue
        # Пропускаем технические "(нет в замере)", "(50-40В)" и т.п.
        if re.match(r'^\d', text):
            continue
        if 'нет в замере' in text.lower():
            continue
        return text[:255]
    return ''


def _extract_kp_date(text: str) -> Optional[str]:
    """Дата КП: ищем 'Дата ... DD.MM.YYYY' либо просто DD.MM.YYYY рядом с шапкой."""
    patterns = [
        r'Дата\s*[А-Яа-я\s\.]*?(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})',
        r'(\d{1,2})[\.\-/](\d{1,2})[\.\-/](\d{4})',
    ]
    for pat in patterns:
        match = re.search(pat, text)
        if not match:
            continue
        try:
            d, m, y = match.groups()
            return datetime(int(y), int(m), int(d)).date().isoformat()
        except (ValueError, TypeError):
            continue
    return None


# ---------- парсинг секций ----------

def _split_into_sections(full_text: str) -> Dict[str, str]:
    """
    Возвращает словарь {section_key: section_body}, где body — текст
    от заголовка секции до следующего заголовка или END_MARKER.
    """
    # Ищем все позиции заголовков
    positions: List[Tuple[int, int, str]] = []  # (start, end_of_header, key)
    for key, pat in SECTION_PATTERNS:
        for m in pat.finditer(full_text):
            positions.append((m.start(), m.end(), key))
    positions.sort(key=lambda x: x[0])

    # Граница конца — END_MARKER
    end_match = END_MARKER.search(full_text)
    text_end = end_match.start() if end_match else len(full_text)

    sections: Dict[str, str] = {}
    for i, (start, end_hdr, key) in enumerate(positions):
        body_end = positions[i + 1][0] if i + 1 < len(positions) else text_end
        sections[key] = full_text[end_hdr:body_end]
    return sections


def _is_anchor_line(line: str) -> bool:
    """Якорная строка заканчивается на два числа (price + sum), оба >= 10."""
    m = re.search(r'(\d{2,8})\s+(\d{2,8})\s*$', line)
    return bool(m)


def _split_section_into_rows(section_text: str) -> List[Tuple[str, str]]:
    """
    Делит текст секции на пары (anchor_line, continuation_text).
    Якорь — строка, заканчивающаяся на `<price> <sum>`.
    Continuation — все строки между этим якорем и следующим.
    """
    rows: List[Tuple[str, str]] = []
    current_anchor: Optional[str] = None
    current_cont: List[str] = []
    for raw in section_text.split('\n'):
        line = raw.strip()
        if not line:
            continue
        # Прерываем при попадании на следующий заголовок (страховка)
        if any(p.match(line) for _, p in SECTION_PATTERNS):
            break
        if _is_anchor_line(line):
            if current_anchor is not None:
                rows.append((current_anchor, ' '.join(current_cont)))
            current_anchor = line
            current_cont = []
        else:
            if current_anchor is not None:
                current_cont.append(line)
    if current_anchor is not None:
        rows.append((current_anchor, ' '.join(current_cont)))
    return rows


def _fix_split_size(anchor: str, continuation: str) -> str:
    """
    Если в якоре последний размер обрезан ('2290полотно*7'), а continuation
    начинается с цифр ('00 врезкой'), склеиваем хвост размера.
    """
    if not continuation:
        return anchor
    # Ищем в якоре «висячий» размер с короткой второй частью
    m = re.search(r'(\d+(?:полотно)?\s*\*\s*)(\d{1,2})(\s|$)', anchor)
    if not m:
        return anchor
    # Может быть несколько матчей; берём ПОСЛЕДНИЙ (ближе к концу строки)
    matches = list(re.finditer(r'(\d+(?:полотно)?\s*\*\s*)(\d{1,2})(\s|$)', anchor))
    last = matches[-1]
    # Эвристика: если число «короткое» (1-2 цифры) и в начале continuation идут цифры — склеиваем
    m_cont = re.match(r'(\d+)', continuation)
    if not m_cont:
        return anchor
    head = anchor[:last.start(2)]
    tail = anchor[last.end(2):]
    fixed_size = last.group(2) + m_cont.group(1)
    return f'{head}{fixed_size}{tail}'


def _parse_door_row(joined_line: str) -> Optional[Dict[str, Any]]:
    """
    Парсит склеенную строку секции 'Модель полотна'.
    Формат: <desc> <qty> <H*W> [<H_proem*W_proem>] [<opening>] <price> <sum>
    Если у двери есть рек.проём — восстанавливаем обрезанные размеры (door = проём - 70/-100).
    """
    # Снимаем последние 2 числа — price и sum
    m_tail = re.search(r'^(.*?)\s+(\d{2,8})\s+(\d{2,8})\s*$', joined_line)
    if not m_tail:
        return None
    head = m_tail.group(1)
    price = _to_decimal(m_tail.group(2))
    summ = _to_decimal(m_tail.group(3))

    # Размер(ы) ищем в head; отфильтровываем технические размеры в описании
    # (например «(обкатка 4*15 мм)» — оба значения < 50, это не размер двери)
    all_sizes = list(SIZE_RE.finditer(head))
    sizes = [m for m in all_sizes if not (int(m.group(1)) < 50 and int(m.group(2)) < 50)]
    if not sizes:
        # Fallback: формат «<desc> <qty> *» (панель без размера, доп. позиция)
        m_qty_star = re.search(r'(\d{1,3})\s*\*\s*$', head)
        if m_qty_star:
            qty = int(m_qty_star.group(1))
            description = head[:m_qty_star.start()].strip()
            return {
                'description': description,
                'qty': qty,
                'door_height': None,
                'door_width': None,
                'rec_opening_height': None,
                'rec_opening_width': None,
                'opening_type': '',
                'price': price,
                'sum': summ,
            }
        return None
    first_size = sizes[0]
    door_h, door_w = int(first_size.group(1)), int(first_size.group(2))

    # Рек.проём — второй размер в строке (если есть)
    rec_h, rec_w = None, None
    if len(sizes) >= 2:
        rec_h, rec_w = int(sizes[1].group(1)), int(sizes[1].group(2))
        # Некоторые КП пишут рек.проём в формате ШхВ — переставляем местами,
        # если высота явно меньше ширины (двери всегда выше, чем шире).
        if rec_h < rec_w and rec_w > 1500:
            rec_h, rec_w = rec_w, rec_h
        # Восстанавливаем обрезанные door-размеры через рек.проём (door = проём -70/-100)
        if door_w < 100 and rec_w >= 200:
            door_w = rec_w - 100
        if door_h < 100 and rec_h >= 200:
            door_h = rec_h - 70

    # Тот же swap для размера двери (на случай разнобоя)
    if door_h is not None and door_w is not None and door_h < door_w and door_w > 1500:
        door_h, door_w = door_w, door_h

    # qty — последнее число перед первым размером
    before_size = head[:first_size.start()].rstrip()
    m_qty = re.search(r'(\d{1,3})\s*$', before_size)
    if not m_qty:
        return None
    qty = int(m_qty.group(1))
    description = before_size[:m_qty.start()].strip()

    # Открывание ищем после первого (или второго) размера
    after_sizes_start = sizes[-1].end()
    opening_text = head[after_sizes_start:].strip()
    opening_type = _normalize_opening_token(opening_text)

    return {
        'description': description,
        'qty': qty,
        'door_height': door_h,
        'door_width': door_w,
        'rec_opening_height': rec_h,
        'rec_opening_width': rec_w,
        'opening_type': opening_type,
        'price': price,
        'sum': summ,
    }


def _parse_addon_row(joined_line: str) -> Optional[Dict[str, Any]]:
    """
    Парсит склеенную строку секций аддонов.
    Форматы (в порядке проверки):
      1) <desc> <qty> *                <price> <sum>   — петли/наличники/добор/механизмы/услуги
      2) <desc> <qty> <H*W> [<open>]   <price> <sum>   — короб/стекло/доп. к заказу
      3) <desc> <qty>                  <price> <sum>   — fallback
    """
    m_tail = re.search(r'^(.*?)\s+(\d{2,8})\s+(\d{2,8})\s*$', joined_line)
    if not m_tail:
        return None
    head = m_tail.group(1)
    price = _to_decimal(m_tail.group(2))
    summ = _to_decimal(m_tail.group(3))

    # Вариант 1: «qty *» в самом конце head
    m_qty_star = re.search(r'(\d{1,3})\s*\*\s*$', head)
    if m_qty_star:
        return {
            'description': head[:m_qty_star.start()].strip(),
            'qty': int(m_qty_star.group(1)),
            'size_h': None,
            'size_w': None,
            'opening_type': '',
            'price': price,
            'sum': summ,
        }

    # Вариант 2: размер в конце head (короба) — берём ПОСЛЕДНИЙ размер
    sizes = list(SIZE_RE.finditer(head))
    if sizes:
        last_size = sizes[-1]
        before_size = head[:last_size.start()].rstrip()
        m_qty = re.search(r'(\d{1,3})\s*$', before_size)
        if m_qty:
            opening_text = head[last_size.end():].strip()
            return {
                'description': before_size[:m_qty.start()].strip(),
                'qty': int(m_qty.group(1)),
                'size_h': int(last_size.group(1)),
                'size_w': int(last_size.group(2)),
                'opening_type': _normalize_opening_token(opening_text),
                'price': price,
                'sum': summ,
            }

    # Вариант 3 не используем — слишком ненадёжен (жадно хватает цифры из размеров).
    # Не распознанные строки пользователь поправит в превью.
    return None


# ---------- сборка результата ----------

def _build_addon_dict(parsed_addon: Dict[str, Any], kind: str) -> Dict[str, Any]:
    """Аддон-уровня заказа (не привязывается к проёму)."""
    size = ''
    if parsed_addon.get('size_h') and parsed_addon.get('size_w'):
        size = f"{parsed_addon['size_h']}*{parsed_addon['size_w']}"
    return {
        'kind': kind,
        'name': (parsed_addon['description'] or '')[:500],
        'quantity': parsed_addon['qty'] or 1,
        'size': size,
        'opening_type': parsed_addon.get('opening_type', ''),
        'price': str(parsed_addon['price']) if parsed_addon['price'] is not None else None,
        'amount': str(parsed_addon['sum']) if parsed_addon.get('sum') is not None else None,
        'comment': '',
    }


# ---------- public API ----------

def parse_kp_pdf(pdf_file) -> Dict[str, Any]:
    """
    Парсит PDF КП и возвращает данные для создания заказа.
    """
    result: Dict[str, Any] = {
        'kp_number': '',
        'kp_date': None,
        'client_name': '',
        'contact_phone': '',
        'address': '',
        'manager_name': '',
        'items': [],
        'addons': [],
    }

    try:
        with pdfplumber.open(pdf_file) as pdf:
            full_text = '\n'.join((p.extract_text() or '') for p in pdf.pages)
            if not full_text.strip():
                logger.warning('parse_kp_pdf: пустой текст')
                return result

            # Шапка
            normalized = re.sub(r'\s+', ' ', full_text)
            result['kp_number'] = _extract_order_number(normalized)
            result['client_name'] = _extract_client_name(normalized)
            result['contact_phone'] = _extract_contact_phone(normalized)
            result['address'] = _extract_address(normalized)
            result['manager_name'] = _extract_manager_name(normalized)
            result['kp_date'] = _extract_kp_date(full_text)

            # Секции
            sections = _split_into_sections(full_text)

            # Двери / стеновые панели
            door_items: List[Dict[str, Any]] = []
            for anchor, cont in _split_section_into_rows(sections.get('doors', '')):
                anchor_fixed = _fix_split_size(anchor, cont)
                parsed = _parse_door_row(anchor_fixed)
                if not parsed:
                    continue
                # Открывание — учитываем continuation (там может быть «ИНВЕРСО»)
                opening_full_text = anchor_fixed + ' ' + cont
                # Берём текст вокруг последнего размера для open type
                m_size = list(SIZE_RE.finditer(anchor_fixed))
                opening_text_part = ''
                if m_size:
                    opening_text_part = anchor_fixed[m_size[-1].end():]
                opening_text_part += ' ' + cont
                parsed['opening_type'] = _normalize_opening_token(opening_text_part) or parsed['opening_type']
                # Полное описание = anchor description + continuation
                full_desc = (parsed['description'] + ' ' + cont).strip()
                base = {
                    'room_name': _extract_room_from_description(full_desc),
                    'model_name': full_desc[:500],
                    'price': str(parsed['price']) if parsed['price'] is not None else None,
                    'door_type': _detect_door_type(full_desc),
                    'opening_type': parsed['opening_type'],
                    'door_height': parsed['door_height'],
                    'door_width': parsed['door_width'],
                    'recommended_opening_height': parsed.get('rec_opening_height'),
                    'recommended_opening_width': parsed.get('rec_opening_width'),
                }
                # Раскрываем количество в отдельные строки: qty=3 → 3 строки по qty=1
                qty = max(1, int(parsed['qty'] or 1))
                # amount на одну штуку = price; если qty=1, оставляем исходную сумму
                per_unit_amount = (
                    str(parsed['price']) if qty > 1 and parsed['price'] is not None
                    else (str(parsed['sum']) if parsed['sum'] is not None else None)
                )
                for _ in range(qty):
                    door_items.append({
                        **base,
                        'opening_number': len(door_items) + 1,
                        'quantity': 1,
                        'amount': per_unit_amount,
                    })

            # Аддоны идут отдельным списком на уровне заказа
            all_addons: List[Dict[str, Any]] = []
            for sec_key, kind in ADDON_KIND_BY_SECTION.items():
                section_text = sections.get(sec_key, '')
                for anchor, cont in _split_section_into_rows(section_text):
                    anchor_fixed = _fix_split_size(anchor, cont)
                    parsed = _parse_addon_row(anchor_fixed)
                    if not parsed:
                        continue
                    # Учитываем INVERSO в continuation для коробов
                    if kind == 'box':
                        m_size = list(SIZE_RE.finditer(anchor_fixed))
                        opening_text_part = anchor_fixed[m_size[-1].end():] if m_size else ''
                        opening_text_part += ' ' + cont
                        parsed['opening_type'] = _normalize_opening_token(opening_text_part) or parsed['opening_type']
                    full_desc = (parsed['description'] + ' ' + cont).strip()
                    parsed['description'] = full_desc
                    all_addons.append(_build_addon_dict(parsed, kind))

            result['items'] = door_items
            result['addons'] = all_addons

            logger.info(
                'parse_kp_pdf: клиент=%s, дверей=%d, аддонов=%d',
                result['client_name'], len(door_items), len(all_addons),
            )

    except Exception as exc:
        logger.error('parse_kp_pdf: ошибка %s', exc, exc_info=True)
        raise ValueError(f'Не удалось распарсить PDF: {exc}')

    return result
