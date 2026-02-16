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


def _first_row_is_header(first_cell: str) -> bool:
    """Проверяет, что первая строка — заголовок, а не продолжение данных со прошлой страницы."""
    if not first_cell or len(first_cell) < 3:
        return False
    cell = first_cell.lower().strip()
    # Признаки строки данных (БЛОК 3..., Стеновые панели, SKY полотно и т.д.)
    if any(x in cell[:120] for x in (
        'блок ', 'блок.', 'стеновые панели', 'piana', 'sky полотно',
        'шпонка', 'добор шириной', 'мдф без покрытия', 'мдф без отделки',
        'кромка рал', 'алюминиевая кромка', 'сни '
    )):
        return False
    # Заголовок: короткая ячейка с названием колонки
    if any(x in cell for x in ('модель полотн', 'дверной короб', 'наличник', 'вид/артикул', 'механизм', 'петл')) and len(cell) < 100:
        return True
    return len(cell) < 60


def _extract_defective_products(pdf, full_text: str) -> List[Dict[str, str]]:
    """Извлекает список бракованных изделий"""
    products = []
    
    try:
        for page in pdf.pages:
            tables = page.extract_tables()
            if tables:
                for table in tables:
                    if len(table) < 1:
                        continue
                    first_row = table[0]
                    first_cell = str(first_row[0]).strip() if first_row and first_row[0] else ''
                    has_header = _first_row_is_header(first_cell)
                    rows = table[1:] if has_header else table
                    headers = [str(c).lower() if c else '' for c in first_row]

                    name_idx = None
                    qty_idx = None
                    size_idx = None
                    opening_idx = None

                    for i, h in enumerate(headers):
                        hl = h.lower() if h else ''
                        if any(x in hl for x in ('модель', 'полотн', 'короб', 'наличник', 'добор', 'вид', 'артикул')):
                            name_idx = i
                        elif 'кол' in hl and ('во' in hl or '-' in hl):
                            qty_idx = i
                        elif 'размер' in hl:
                            size_idx = i
                        elif 'открыва' in hl:
                            opening_idx = i

                    if name_idx is None and not has_header and first_cell:
                        n = len(first_row) if first_row else 0
                        name_idx, qty_idx, size_idx, opening_idx = 0, 1 if n > 1 else None, 2 if n > 2 else None, 4 if n > 4 else None

                    if name_idx is None and has_header:
                        continue

                    if name_idx is not None:
                        for row_idx, row in enumerate(rows):
                            if row and len(row) > name_idx and row[name_idx]:
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
