"""
Тесты разбора изделий КП для рекламации.

Изделия берутся из таблиц PDF, но таблица — вещь ненадёжная: строка у нижнего
края листа теряется целиком, потому что её нижняя граница совпадает с краем
таблицы. Так пропадала целая секция «Ручки + накладки» из одной строки —
в тексте страницы она есть, в `extract_tables()` её нет. На этот случай и
существует разбор по тексту; раньше он умел только строки с полным размером
(«2 2000*800») и только у коробов, наличников и доборов, поэтому артикульные
позиции — цилиндры, ручки, накладки — не подхватывал.
"""
from django.test import SimpleTestCase

from projects.pdf_parser import (
    _extract_products_from_page_text,
    _looks_like_section_header,
    _meaningful_size,
    _merge_product_candidates,
)


class ExtractFromPageTextTests(SimpleTestCase):
    def test_article_row_with_placeholder_size(self):
        """Строка секции «Ручки + накладки»: размера нет, только звёздочка."""
        page = '1 850222 Цилиндр STD AI ЛВ-90 (50-40В) 1 * 4050 4050'
        products = _extract_products_from_page_text(page)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0]['product_name'], '850222 Цилиндр STD AI ЛВ-90 (50-40В)')
        self.assertEqual(products[0]['quantity'], '1')
        # «*» — заглушка фабрики, а не размер.
        self.assertEqual(products[0]['size'], '')

    def test_row_with_full_size_and_no_number(self):
        """У фальшфрамуг номер позиции уезжает в соседнюю строку."""
        page = 'Фальшфрамуги KOMPLANAR для коробов KOMPLANAR 1 937*787 13900 13900'
        products = _extract_products_from_page_text(page)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0]['size'], '937*787')
        self.assertTrue(products[0]['product_name'].startswith('Фальшфрамуги'))

    def test_fractional_quantity_is_kept(self):
        page = '5 Добор шириной 90 мм., паз с 2-х сторон 2.5 * 950 2375'
        products = _extract_products_from_page_text(page)
        self.assertEqual(products[0]['quantity'], '2.5')

    def test_next_section_header_is_not_glued_to_the_name(self):
        """
        Продолжение наименования берётся со следующих строк, и шапка секции
        туда попадать не должна — а начинается она с «№», из-за чего раньше
        и приклеивалась.
        """
        page = (
            '1 850225 Петля скрытой установки ACADEMY 5000 BL 14 0* 4750 66500\n'
            'черный *\n'
            '№ Ручки + накладки (модель/артикул) Кол-во Цена Сумма\n'
            '1 850222 Цилиндр STD AI ЛВ-90 (50-40В) 1 * 4050 4050'
        )
        products = _extract_products_from_page_text(page)
        self.assertEqual(len(products), 2)
        self.assertEqual(
            products[0]['product_name'],
            '850225 Петля скрытой установки ACADEMY 5000 BL черный *',
        )
        self.assertNotIn('Ручки + накладки', products[0]['product_name'])

    def test_services_are_skipped(self):
        page = (
            '1 Доставка по городу (Регионы) (до подъезда, без 1 * 2850 2850\n'
            '2 Подъем на лифте полотен (без короба) Н меньше или 7 * 700 4900'
        )
        self.assertEqual(_extract_products_from_page_text(page), [])

    def test_totals_are_not_products(self):
        page = 'Стоимость товара: 296260.00\nИтого 392110.00\n% 57654'
        self.assertEqual(_extract_products_from_page_text(page), [])


class SectionHeaderTests(SimpleTestCase):
    def test_headers_are_recognised(self):
        for line in (
            '№ Ручки + накладки (модель/артикул) Кол-во Цена Сумма',
            '№ Добор Кол-во Размер Цена Сумма',
            'Механизмы (вид/артикул) Кол-во Цена Сумма',
        ):
            with self.subTest(line=line):
                self.assertTrue(_looks_like_section_header(line))

    def test_product_lines_are_not_headers(self):
        for line in (
            'черный *',
            '850222 Цилиндр STD AI ЛВ-90 (50-40В)',
            'мм. милк софт ZB 810-2 EVO (Обрамление входной зоны)',
        ):
            with self.subTest(line=line):
                self.assertFalse(_looks_like_section_header(line))


class MeaningfulSizeTests(SimpleTestCase):
    def test_placeholders(self):
        for size in ('*', '0*', '', '0'):
            self.assertFalse(_meaningful_size(size), size)

    def test_real_sizes(self):
        for size in ('2250*', '*90', '2100*70', '937*787'):
            self.assertTrue(_meaningful_size(size), size)


class MergeCandidatesTests(SimpleTestCase):
    def test_row_already_taken_from_the_table_is_not_duplicated(self):
        products = [{
            'product_name': '850225 Петля скрытой установки ACADEMY 5000 BL черный *',
            'quantity': '14', 'size': '', 'opening_type': '', 'problem_description': '',
        }]
        candidate = dict(products[0])
        _merge_product_candidates(products, [candidate])
        self.assertEqual(len(products), 1)

    def test_missing_row_is_added(self):
        products = [{
            'product_name': '850225 Петля скрытой установки ACADEMY 5000 BL черный *',
            'quantity': '14', 'size': '', 'opening_type': '', 'problem_description': '',
        }]
        candidate = {
            'product_name': '850222 Цилиндр STD AI ЛВ-90 (50-40В)',
            'quantity': '1', 'size': '', 'opening_type': '', 'problem_description': '',
        }
        _merge_product_candidates(products, [candidate])
        self.assertEqual(len(products), 2)
        self.assertEqual(products[1]['product_name'], '850222 Цилиндр STD AI ЛВ-90 (50-40В)')

    def test_short_candidate_does_not_shorten_the_full_name(self):
        """
        Кандидат из текста обрывается на переносе строки. Таким названием
        затирать полное, собранное из таблицы, нельзя.
        """
        products = [{
            'product_name': 'VERUM стопор скрытый магнитный Modello2 Серый матовый',
            'quantity': '6', 'size': '', 'opening_type': '', 'problem_description': '',
        }]
        _merge_product_candidates(products, [{
            'product_name': 'VERUM стопор скрытый магнитный Modello2 Серый',
            'quantity': '6', 'size': '', 'opening_type': '', 'problem_description': '',
        }])
        self.assertEqual(len(products), 1)
        self.assertEqual(
            products[0]['product_name'],
            'VERUM стопор скрытый магнитный Modello2 Серый матовый',
        )

    def test_truncated_row_is_completed(self):
        products = [{
            'product_name': 'Фальшфрамуги KOMPLANAR для коробов KOMPLANAR',
            'quantity': '1', 'size': '', 'opening_type': '', 'problem_description': '',
        }]
        _merge_product_candidates(products, [{
            'product_name': 'Фальшфрамуги KOMPLANAR для коробов KOMPLANAR INVERSO, WAVE 04, эмаль',
            'quantity': '1', 'size': '937*787', 'opening_type': '', 'problem_description': '',
        }])
        self.assertEqual(len(products), 1)
        self.assertIn('INVERSO', products[0]['product_name'])
        self.assertEqual(products[0]['size'], '937*787')
