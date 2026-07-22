"""
Парсер PDF файлов для извлечения данных рекламации
"""
import re
import logging
from typing import Dict, List, Optional, Any
import pdfplumber

logger = logging.getLogger(__name__)


def parse_complaint_pdf(pdf_file) -> Dict[str, Any]:
    """
    Парсит PDF файл и извлекает данные для создания рекламации
    
    Args:
        pdf_file: Файловый объект PDF
        
    Returns:
        Словарь с извлеченными данными:
        {
            'order_number': str,
            'client_name': str,
            'contact_person': str,
            'contact_phone': str,
            'address': str,
            'defective_products': List[Dict]  # список изделий
        }
    """
    result = {
        'order_number': '',
        'client_name': '',
        'contact_person': '',
        'contact_phone': '',
        'address': '',
        'manager_name': '',
        'defective_products': [],
    }
    
    try:
        # Открываем PDF файл
        with pdfplumber.open(pdf_file) as pdf:
            # Извлекаем весь текст из всех страниц
            full_text = ''
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + '\n'
            
            if not full_text:
                logger.warning('Не удалось извлечь текст из PDF')
                return result
            
            # Нормализуем текст (убираем лишние пробелы, переносы)
            full_text = re.sub(r'\s+', ' ', full_text)
            
            # Извлекаем номер заказа
            result['order_number'] = _extract_order_number(full_text)
            
            # Извлекаем наименование клиента (покупателя)
            result['client_name'] = _extract_client_name(full_text)
            
            # Извлекаем контактное лицо (если не найдено, используем имя покупателя)
            result['contact_person'] = _extract_contact_person(full_text)
            if not result['contact_person'] and result['client_name']:
                result['contact_person'] = result['client_name']
                logger.info(f'Контактное лицо не найдено, используем имя покупателя: {result["client_name"]}')
            
            # Извлекаем телефон
            result['contact_phone'] = _extract_contact_phone(full_text)
            
            # Извлекаем адрес
            result['address'] = _extract_address(full_text)
            
            # Извлекаем имя менеджера
            result['manager_name'] = _extract_manager_name(full_text)
            
            # Извлекаем бракованные изделия
            result['defective_products'] = _extract_defective_products(pdf, full_text)
            
            logger.info(f'Успешно распарсен PDF. Найдено изделий: {len(result["defective_products"])}')
            
    except Exception as e:
        logger.error(f'Ошибка при парсинге PDF: {str(e)}', exc_info=True)
        raise ValueError(f'Ошибка при парсинге PDF файла: {str(e)}')
    
    return result


def _extract_order_number(text: str) -> str:
    """Извлекает номер заказа из текста"""
    # Паттерны для поиска номера заказа
    patterns = [
        # Паттерн для формата "Приложение №1 (Счет-Заказ) к договору купли-продажи № 42-306393-1"
        r'договор[а-я]*\s+купли[-\s]продажи\s*[№#]\s*([0-9\-]+)',
        r'счет[-\s]заказ[а]?\s*[№#]?\s*:?\s*([0-9A-Z\-]+)',
        r'заказ[а]?\s*[№#]?\s*:?\s*([0-9A-Z\-]+)',
        r'номер\s+заказа[а]?\s*:?\s*([0-9A-Z\-]+)',
        r'№\s*([0-9\-]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            order_num = match.group(1).strip()
            # Убираем лишние символы, оставляем цифры и дефисы
            order_num = re.sub(r'[^\w\-]', '', order_num)
            if order_num and len(order_num) >= 3:  # Минимальная длина номера
                return order_num
    
    return ''


def _extract_client_name(text: str) -> str:
    """Извлекает наименование клиента"""
    # Паттерны для поиска клиента
    patterns = [
        # Паттерн для формата "Покупатель (Ф.И.О.) Нурмухаметова Альфира Миниахматовна"
        r'покупатель\s*\([^\)]*\)\s*([А-ЯЁ][А-Яа-яё\s]+?)(?:адрес|телефон|email|подразделение|менеджер|\n\n|$)',
        r'клиент[а]?\s*\([^\)]*\)\s*([А-ЯЁ][А-Яа-яё\s]+?)(?:адрес|телефон|email|подразделение|менеджер|\n\n|$)',
        r'покупатель[а]?\s*:?\s*([А-ЯЁ][А-Яа-яё\s\.,]+?)(?:адрес|телефон|email|подразделение|менеджер|\n\n|$)',
        r'клиент[а]?\s*:?\s*([А-ЯЁ][А-Яа-яё\s\.,]+?)(?:адрес|телефон|email|подразделение|менеджер|\n\n|$)',
        r'заказчик[а]?\s*:?\s*([А-ЯЁ][А-Яа-яё\s\.,]+?)(?:адрес|телефон|email|подразделение|менеджер|\n\n|$)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            client_name = match.group(1).strip()
            # Очищаем от лишних символов и нормализуем пробелы
            client_name = re.sub(r'\s+', ' ', client_name)
            # Убираем возможные артефакты после имени
            client_name = re.sub(r'\s*(адрес|телефон|email).*$', '', client_name, flags=re.IGNORECASE)
            if len(client_name) > 3:  # Минимальная длина названия
                return client_name
    
    return ''


def _extract_contact_person(text: str) -> str:
    """Извлекает контактное лицо (ФИО)"""
    # Паттерны для поиска контактного лица
    patterns = [
        r'контактное\s+лицо\s*:?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)',
        r'контакт\s*:?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)',
        r'ответственное\s+лицо\s*:?\s*([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            contact = match.group(1).strip()
            if len(contact.split()) >= 2:  # Минимум имя и фамилия
                return contact
    
    return ''


def _extract_manager_name(text: str) -> str:
    """Извлекает имя менеджера"""
    # Паттерны для поиска менеджера
    patterns = [
        # Паттерн для формата "Менеджер(Ф.И.О.) Кузнецова Людмила"
        r'менеджер\s*\([^\)]*\)\s*([А-ЯЁ][А-Яа-яё\s]+?)(?:покупатель|адрес|телефон|email|подразделение|\n\n|$)',
        r'менеджер\s*:?\s*([А-ЯЁ][А-Яа-яё\s]+?)(?:покупатель|адрес|телефон|email|подразделение|\n\n|$)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            manager_name = match.group(1).strip()
            # Очищаем от лишних символов и нормализуем пробелы
            manager_name = re.sub(r'\s+', ' ', manager_name)
            # Убираем возможные артефакты после имени
            manager_name = re.sub(r'\s*(адрес|телефон|email|покупатель).*$', '', manager_name, flags=re.IGNORECASE)
            if len(manager_name) > 3:  # Минимальная длина имени
                return manager_name
    
    return ''


def _extract_contact_phone(text: str) -> str:
    """Извлекает телефон"""
    # Паттерны для поиска телефона (включая формат +79673908577)
    patterns = [
        # Сначала ищем телефон в строке "Телефоны +79673908577"
        r'телефон[ыа]?\s*:?\s*(\+?[78][0-9]{10})',
        r'тел\.?\s*:?\s*(\+?[78][0-9]{10})',
        # Более общие паттерны
        r'телефон[ыа]?\s*:?\s*([\+7]?[78]?[\s\-\(]?[0-9]{3}[\s\-\)]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2})',
        r'тел\.?\s*:?\s*([\+7]?[78]?[\s\-\(]?[0-9]{3}[\s\-\)]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2})',
        # Паттерн для номеров без пробелов типа +79673908577
        r'(\+?[78][0-9]{10})',
        # С пробелами и дефисами
        r'([\+7]?[78]?[\s\-\(]?[0-9]{3}[\s\-\)]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2})',
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            phone = match.group(1).strip()
            # Нормализуем телефон (убираем пробелы, скобки, дефисы)
            phone = re.sub(r'[\s\-\(\)]', '', phone)
            # Добавляем +7 если начинается с 7 или 8
            if phone.startswith('8') and len(phone) == 11:
                phone = '+7' + phone[1:]
            elif phone.startswith('7') and len(phone) == 11:
                phone = '+' + phone
            elif not phone.startswith('+') and len(phone) == 10:
                phone = '+7' + phone
            
            # Проверяем что получился валидный телефон
            if phone.startswith('+7') and len(phone) == 12:
                return phone
    
    return ''


def _extract_address(text: str) -> str:
    """Извлекает адрес"""
    # Паттерны для поиска адреса
    patterns = [
        # Паттерн для "Подразделение г. Казань, ул. Ямашева д 93, ТК САВИНОВО, тел ..."
        # Извлекаем адрес между "Подразделение" и "тел"
        r'подразделение\s+([гГ]\.\s*[А-ЯЁ][А-Яа-яё\s,\.0-9\-]+?)(?:\s*,?\s*тел|телефон|$)',
        # Паттерн для "Адрес доставки"
        r'адрес[а]?\s*(?:установки|доставки|монтажа)?\s*:?\s*([А-ЯЁ][А-Яа-яё0-9\s\.,\-\/]+?)(?:\n|телефон|контакт|заказ|email|$)',
        # Общий паттерн для адреса
        r'адрес\s*:?\s*([А-ЯЁ][А-Яа-яё0-9\s\.,\-\/]+?)(?:\n|телефон|контакт|заказ|email|$)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            address = match.group(1).strip()
            # Очищаем от лишних пробелов и переносов
            address = re.sub(r'\s+', ' ', address)
            # Убираем возможные хвосты (номера телефонов, email)
            address = re.sub(r'\s*,?\s*(тел|телефон|email|e-mail).*$', '', address, flags=re.IGNORECASE)
            address = address.strip(' ,')
            if len(address) > 10:  # Минимальная длина адреса
                return address
    
    return ''


# Названия колонок таблиц КП (точное совпадение ячейки после нормализации)
_HEADER_COLUMN_CELLS = {
    '№', 'кол-во', 'кол во', 'колво', 'цена', 'сумма', 'размер',
    'открывание', 'рек.проем', 'рек. проем', 'рек.проём', 'рек. проём',
}
# Маркеры колонки с наименованием изделия (секции, которые попадают в рекламацию).
# «доп» — секция «Доп. к заказу»: в ней бывают реальные изделия (панели, доборы и т.п.).
_NAME_COLUMN_MARKERS = ('модель', 'полотн', 'короб', 'наличник', 'добор', 'вид', 'артикул', 'доп')


# Строки-услуги: в изделия рекламации не попадают (секция «Услуги» и её продолжения
# на следующей странице, где заголовок секции недоступен)
_SERVICE_ROW_RE = re.compile(r'^(доставка|подъем|подъём|занос|пронос|ручной пронос|разгрузка|монтаж|демонтаж)\b', re.IGNORECASE)


def _row_looks_like_data(row) -> bool:
    """
    Строка данных таблицы изделий: есть числовые колонки (кол-во/цена/сумма).
    Отличает продолжение таблицы изделий на новой странице от информационных
    таблиц (реквизиты заказа, блок оплаты), где чисто числовых ячеек нет.
    """
    if not row:
        return False
    numeric_cells = sum(
        1 for c in row
        if c is not None and re.fullmatch(r'\d+(?:[.,]\d+)?', str(c).strip())
    )
    return numeric_cells >= 2


def _section_header_indices(row) -> Any:
    """
    Распознаёт строку-шапку секции таблицы КП («№ Модель полотна Кол-во …»,
    «Добор Кол-во Размер …») и возвращает индексы колонок
    (name_idx, qty_idx, size_idx, opening_idx).

    В новом формате КП все секции (полотна, короба, петли, ручки, механизмы, услуги)
    идут строками одной большой таблицы, поэтому шапки нужно ловить на любой строке
    и переключать колонки на ходу.

    Возвращает: кортеж индексов; 'skip' — шапка секции без изделий (Услуги, Стекло и т.п.),
    её строки в рекламацию не берём; None — обычная строка данных.
    """
    if not row:
        return None
    cells = [re.sub(r'\s+', ' ', str(c).strip().lower()) if c else '' for c in row]
    # Шапка = минимум три ячейки с точными названиями колонок
    column_cells = sum(1 for c in cells if c in _HEADER_COLUMN_CELLS)
    if column_cells < 3:
        return None
    name_idx = None
    for i, c in enumerate(cells):
        if c and c not in _HEADER_COLUMN_CELLS and len(c) < 60 and any(m in c for m in _NAME_COLUMN_MARKERS):
            name_idx = i
            break
    if name_idx is None:
        return 'skip'
    qty_idx = size_idx = opening_idx = None
    for i, c in enumerate(cells):
        if i == name_idx or not c:
            continue
        if qty_idx is None and c.startswith('кол'):
            qty_idx = i
        elif size_idx is None and 'размер' in c:
            size_idx = i
        elif opening_idx is None and 'открыва' in c:
            opening_idx = i
    return (name_idx, qty_idx, size_idx, opening_idx)


def _normalize_product_text(value: str) -> str:
    """Нормализует название изделия для сравнения и дедупликации."""
    return re.sub(r'[\s,.;:!]+', ' ', (value or '').lower()).strip()


def _extract_products_from_page_text(page_text: str, next_page_first_line: str = '') -> List[Dict[str, str]]:
    """
    Дополняет изделия из обычного текста страницы.
    Нужно для случаев, когда строка таблицы разрывается на стыке страниц.
    """
    if not page_text:
        return []

    lines = [re.sub(r'\s+', ' ', (line or '').strip()) for line in page_text.split('\n')]
    lines = [line for line in lines if line]
    products: List[Dict[str, str]] = []

    # Ищем строки вида: "<наименование> <кол-во> <размер> <цена> <сумма>"
    row_pattern = re.compile(
        r'^(?P<name>.+?)\s+(?P<qty>\d+)\s+(?P<size>\d{2,4}\*\d{2,4})\s+\d+\s+\d+\s*$'
    )
    valid_name_starts = (
        'короб', 'стеновые панели', 'фальшфрамуги', 'добор', 'наличник', 'wave', 'opera'
    )

    i = 0
    while i < len(lines):
        line = lines[i]
        match = row_pattern.match(line)
        if not match:
            i += 1
            continue

        product_name = match.group('name').strip()
        if not product_name.lower().startswith(valid_name_starts):
            i += 1
            continue

        # Часто продолжение наименования уходит на следующую строку (например "INVERSO, ...").
        appended_continuation = False
        j = i + 1
        while j < len(lines):
            next_line = lines[j].strip()
            is_next_header = bool(re.match(r'^(модель|дверной короб|наличник|добор|петли|ручки|механизмы|стекло|доп\.)', next_line, re.IGNORECASE))
            has_table_numbers = bool(re.search(r'\d{2,4}\*\d{2,4}', next_line))
            if not next_line or is_next_header or has_table_numbers or row_pattern.match(next_line):
                break
            one_word_continuations = {'верхние', 'боковые', 'оборотные', 'лицевые'}
            if len(next_line.split()) < 2 and next_line.lower() not in one_word_continuations:
                break
            product_name = f'{product_name} {next_line}'.strip()
            appended_continuation = True
            j += 1
        if appended_continuation:
            i = j - 1

        # Если перенос ушел на следующую страницу (часто "эмаль ..."), доклеиваем первую строку следующей страницы.
        if next_page_first_line:
            first_line = re.sub(r'\s+', ' ', next_page_first_line.strip())
            should_add_next_page_line = (
                first_line
                and re.match(r'^(эмаль|бисквит|лицевые|оборотные)', first_line, re.IGNORECASE)
                and first_line.lower() not in product_name.lower()
                and 'эмаль' not in product_name.lower()
                and 'фальшфрамуги' in product_name.lower()
            )
            if should_add_next_page_line:
                product_name = f'{product_name} {first_line}'.strip()

        products.append({
            'product_name': product_name,
            'quantity': match.group('qty'),
            'size': match.group('size'),
            'opening_type': '',
            'problem_description': '',
        })
        i += 1

    return products


def _merge_product_candidates(products: List[Dict[str, str]], candidates: List[Dict[str, str]]) -> None:
    """Сливает найденные изделия, избегая дублей и заменяя обрезанные строки полными."""
    for candidate in candidates:
        candidate_name_norm = _normalize_product_text(candidate.get('product_name', ''))
        candidate_qty = candidate.get('quantity', '')
        candidate_size = candidate.get('size', '')
        if not candidate_name_norm:
            continue
        # Дополняем только фальшфрамуги: именно они в этом PDF чаще рвутся на стыке страниц.
        if 'фальшфрамуги' not in candidate_name_norm:
            continue

        # 1) Точный дубль: пропускаем.
        duplicate = False
        for product in products:
            if (
                _normalize_product_text(product.get('product_name', '')) == candidate_name_norm
                and product.get('quantity', '') == candidate_qty
                and product.get('size', '') == candidate_size
            ):
                duplicate = True
                break
            # Мягкий дубль: те же qty/size и очень похожее название (одно является частью другого).
            if (
                product.get('quantity', '') == candidate_qty
                and product.get('size', '') == candidate_size
            ):
                product_name_norm = _normalize_product_text(product.get('product_name', ''))
                if product_name_norm and (
                    product_name_norm in candidate_name_norm or candidate_name_norm in product_name_norm
                ):
                    duplicate = True
                    break
        if duplicate:
            continue

        # 2) Заменяем обрезанную строку (обычно без размера) на полноценную.
        replaced = False
        for product in products:
            product_name_norm = _normalize_product_text(product.get('product_name', ''))
            if (
                product.get('quantity', '') == candidate_qty
                and not product.get('size', '')
                and (
                    product_name_norm in candidate_name_norm
                    or candidate_name_norm in product_name_norm
                    or product_name_norm.startswith('фальшфрамуги komplanar для коробов komplanar')
                )
            ):
                product['product_name'] = candidate.get('product_name', product.get('product_name', ''))
                product['size'] = candidate_size or product.get('size', '')
                replaced = True
                break
        if replaced:
            continue

        products.append(candidate)


def _extract_defective_products(pdf, full_text: str) -> List[Dict[str, str]]:
    """Извлекает список бракованных изделий"""
    products = []
    supplemental_candidates: List[Dict[str, str]] = []
    
    try:
        pages = list(pdf.pages)
        for page_idx, page in enumerate(pages):
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    if len(table) < 1:
                        continue
                    first_row = table[0]

                    # Текущие индексы колонок (name, qty, size, opening); None — строки пропускаем
                    # (информационные таблицы и секции без изделий).
                    current_idx = None
                    if _section_header_indices(first_row) is None and _row_looks_like_data(first_row):
                        # Продолжение таблицы изделий с прошлой страницы (первая строка — данные) —
                        # используем стандартную структуру колонок.
                        n = len(first_row) if first_row else 0
                        current_idx = (
                            0 if n > 0 else None,
                            1 if n > 1 else None,
                            2 if n > 2 else None,
                            4 if n > 4 else None,
                        )

                    for row in table:
                        if not row:
                            continue
                        # Шапка секции — переключаем колонки; строки секций без изделий пропускаем.
                        header_idx = _section_header_indices(row)
                        if header_idx is not None:
                            current_idx = None if header_idx == 'skip' else header_idx
                            continue
                        if current_idx is None or current_idx[0] is None:
                            continue
                        name_idx, qty_idx, size_idx, opening_idx = current_idx
                        if len(row) <= name_idx or not row[name_idx]:
                            continue
                        product_name = str(row[name_idx]).strip()

                        stop_patterns = [
                            r'покупатель\s*\(',
                            r'представитель',
                            r'способ\s+оплаты',
                            r'^дата\s+тип',
                        ]
                        product_name_lower = product_name.lower()
                        should_stop = False
                        for pattern in stop_patterns:
                            if re.search(pattern, product_name_lower):
                                should_stop = True
                                break

                        if should_stop:
                            break

                        if _SERVICE_ROW_RE.match(product_name_lower):
                            continue

                        if product_name and len(product_name) > 5 and not product_name.startswith('Услуги'):
                            product_name = ' '.join(product_name.split())

                            quantity = ''
                            if qty_idx is not None and qty_idx < len(row) and row[qty_idx]:
                                qty_str = str(row[qty_idx]).strip()
                                qty_match = re.search(r'(\d+)', qty_str)
                                if qty_match:
                                    quantity = qty_match.group(1)

                            size = ''
                            if size_idx is not None and size_idx < len(row) and row[size_idx]:
                                size = str(row[size_idx]).strip()
                                size = ' '.join(size.split())

                            opening = ''
                            if opening_idx is not None and opening_idx < len(row) and row[opening_idx]:
                                opening = str(row[opening_idx]).strip()
                                opening = ' '.join(opening.split())

                            product = {
                                'product_name': product_name,
                                'quantity': quantity if quantity else '1',
                                'size': size,
                                'opening_type': opening,
                                'problem_description': '',
                            }
                            product = {k: v if v and v != 'None' else '' for k, v in product.items()}
                            products.append(product)

            # Дополнительный проход по "сырому" тексту страницы для строк,
            # которые разорваны на стыке страниц и теряются в extract_tables().
            next_page_first_line = ''
            if page_idx + 1 < len(pages):
                next_text = pages[page_idx + 1].extract_text() or ''
                next_lines = [line.strip() for line in next_text.split('\n') if line.strip()]
                next_page_first_line = next_lines[0] if next_lines else ''

            page_text_candidates = _extract_products_from_page_text(page.extract_text() or '', next_page_first_line)
            supplemental_candidates.extend(page_text_candidates)

        if supplemental_candidates:
            _merge_product_candidates(products, supplemental_candidates)
        
        # Если не нашли в таблицах, пытаемся найти в тексте построчно
        if not products:
            # Разбиваем текст на строки и ищем строки начинающиеся с названий изделий
            lines = full_text.split('\n')
            for line in lines:
                line = line.strip()
                # Проверяем, начинается ли строка с названия изделия
                if re.match(r'^(OPERA|Короб|Наличник|Добор|Петля|Ручк|Механизм|Стекло)', line, re.IGNORECASE):
                    product_name = line[:100]  # Берем первые 100 символов
                    products.append({
                        'product_name': product_name,
                        'quantity': '1',
                        'size': '',
                        'opening_type': '',
                        'problem_description': '',
                    })
        
    except Exception as e:
        logger.warning(f'Ошибка при извлечении изделий: {str(e)}')
    
    return products
