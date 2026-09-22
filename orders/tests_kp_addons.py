"""
Тесты разбора строк сопутствующих позиций КП.

Ловушка здесь в колонке «Размер»: фабрика пишет её пятью способами —
голая звёздочка («5 *»), только ширина («2.5 *90», доборы), только высота
(«10 2250*», наличники), полный размер («2 2100*70», короба) и высота
словом («1 2450 полотно», короба старого образца). За колонкой может стоять
ещё и открывание — буквой, парой цифр или словами. Количество бывает
дробным: доборную планку и наличник берут по половине.

Разбиралось из этого только два случая, поэтому целые секции КП молча не
попадали в заказ — например все доборы.
"""
from decimal import Decimal

from django.test import SimpleTestCase

from orders.pdf_parser import _build_addon_dict, _normalize_opening_token, _parse_addon_row


class ParseAddonRowTests(SimpleTestCase):
    def test_plain_star_row(self):
        """Наличники и петли: количество целое, размера нет вовсе."""
        row = _parse_addon_row(
            'Наличник компланарный прямой 10х90 мм., h=2250 мм. 5 * 1150 5750'
        )
        self.assertEqual(row['description'], 'Наличник компланарный прямой 10х90 мм., h=2250 мм.')
        self.assertEqual(row['qty'], Decimal('5'))
        self.assertIsNone(row['size_w'])
        self.assertEqual(row['price'], Decimal('1150'))
        self.assertEqual(row['sum'], Decimal('5750'))

    def test_extension_row_has_width_and_fractional_quantity(self):
        row = _parse_addon_row(
            'Добор шириной 90 мм., паз с 2-х сторон, h=2200 мм. (для 2.5 *90 1150 2875'
        )
        self.assertEqual(row['qty'], Decimal('2.5'))
        self.assertEqual(row['size_w'], 90)
        self.assertIsNone(row['size_h'])
        self.assertEqual(row['price'], Decimal('1150'))
        self.assertEqual(row['sum'], Decimal('2875'))
        self.assertTrue(row['description'].startswith('Добор шириной 90 мм.'))

    def test_extension_row_with_whole_quantity(self):
        row = _parse_addon_row(
            'Добор шириной 210 мм., паз с 2-х сторон, h=2200 мм. 3 *210 2600 7800'
        )
        self.assertEqual(row['qty'], Decimal('3'))
        self.assertEqual(row['size_w'], 210)

    def test_box_row_keeps_its_full_size(self):
        """
        У короба в той же колонке полный размер. Количество ищем строго за
        пробелом, иначе «2100*70» читается как «100 штук шириной 70».
        """
        row = _parse_addon_row('Короб телескопический 2 2100*70 D 4250 8500')
        self.assertEqual(row['qty'], Decimal('2'))
        self.assertEqual(row['size_h'], 2100)
        self.assertEqual(row['size_w'], 70)
        self.assertEqual(row['description'], 'Короб телескопический')

    def test_platband_row_has_height_only(self):
        """Наличники бывают с высотой планки вместо размера: «10 2250*»."""
        row = _parse_addon_row(
            'Наличник компланарный ANCONA 22х90 мм., на выбор 10 2250* 2500 25000'
        )
        self.assertEqual(row['qty'], Decimal('10'))
        self.assertEqual(row['size_h'], 2250)
        self.assertIsNone(row['size_w'])

    def test_opening_after_the_size_does_not_break_the_row(self):
        """За размером может стоять открывание — буквой, цифрами или словами."""
        cases = [
            ('Короб компланарный-телескоп 72 мм. 3 * На себя 4250 12750', 3, None, None),
            ('Направляющая st.1300 для скрытого монтажа 1 * 1-1 14190 14190', 1, None, None),
            ('Короб STANDARD PRO 80 мм. (для 1 2450 полотно А правая с 11000 11000', 1, 2450, None),
        ]
        for line, qty, height, width in cases:
            with self.subTest(line=line):
                row = _parse_addon_row(line)
                self.assertIsNotNone(row, 'строка не разобралась')
                self.assertEqual(row['qty'], Decimal(qty))
                self.assertEqual(row['size_h'], height)
                self.assertEqual(row['size_w'], width)

    def test_size_in_the_name_is_not_taken_for_the_size_column(self):
        """
        В наименовании тоже попадаются размеры («брус 50*100»). Колонкой
        считается последняя пара, перед которой стоит количество.
        """
        row = _parse_addon_row(
            'Монтажный брус для настенного крепления 50*100, L = 1 * 1-1 6700 6700'
        )
        self.assertEqual(row['qty'], Decimal('1'))
        self.assertIsNone(row['size_h'])
        self.assertIn('50*100', row['description'])

    def test_row_without_price_and_sum_is_skipped(self):
        """Заголовки секций и мусор не должны превращаться в позиции."""
        self.assertIsNone(_parse_addon_row('Добор Кол-во Размер Цена Сумма'))


class BuildAddonDictTests(SimpleTestCase):
    def test_extension_size_is_its_width(self):
        addon = _build_addon_dict(
            _parse_addon_row(
                'Добор шириной 130 мм., паз с 2-х сторон, h=2200 мм. (для 2.5 *130 1450 3625'
            ),
            'extension',
        )
        self.assertEqual(addon['kind'], 'extension')
        # Пишем как в КП: по голому «130» не понять, ширина это или высота.
        self.assertEqual(addon['size'], '*130')
        self.assertEqual(addon['quantity'], Decimal('2.5'))

    def test_box_size_stays_full(self):
        addon = _build_addon_dict(
            _parse_addon_row('Короб телескопический 2 2100*70 D 4250 8500'), 'box',
        )
        self.assertEqual(addon['size'], '2100*70')

    def test_platband_size_is_its_height(self):
        addon = _build_addon_dict(
            _parse_addon_row('Наличник ANCONA 22х90 мм. 10 2250* 2500 25000'), 'platband',
        )
        self.assertEqual(addon['size'], '2250*')

    def test_platband_has_no_size(self):
        addon = _build_addon_dict(
            _parse_addon_row('Наличник прямой 10х90 мм. 5 * 1150 5750'), 'platband',
        )
        self.assertEqual(addon['size'], '')
        self.assertEqual(addon['quantity'], Decimal('5'))


class NormalizeOpeningTests(SimpleTestCase):
    """
    Открывание пишут в своей колонке, но при переносе строки она рвётся:
    «D не» остаётся в первой строке, «инверсо» уезжает во вторую. Склеенный
    текст читался как «дверь инверсная» — то есть ровно наоборот, и таким
    уходил и в замер, и в рекомендации по подготовке проёма.
    """

    def test_plain_letters(self):
        self.assertEqual(_normalize_opening_token('А- правое'), 'A')
        self.assertEqual(_normalize_opening_token('D левая с заводской врезкой'), 'D')
        self.assertEqual(_normalize_opening_token(''), '')

    def test_inverso_is_recognised(self):
        self.assertEqual(_normalize_opening_token('B ИНВЕРСО'), 'B_INVERSO')
        self.assertEqual(_normalize_opening_token('D Инверсо'), 'D_INVERSO')

    def test_negated_inverso_stays_plain(self):
        self.assertEqual(
            _normalize_opening_token('D не инверсо', negated=True), 'D',
        )
        # Без отметки об отрицании слово «инверсо» из продолжения строки
        # по-прежнему работает — ради него продолжение и смотрим.
        self.assertEqual(
            _normalize_opening_token('D 21000 21000 магнитный замок инверсо'), 'D_INVERSO',
        )

    def test_inverso_only_for_b_and_d(self):
        self.assertEqual(_normalize_opening_token('A инверсо'), 'A')


class DoorRowQuantityTests(SimpleTestCase):
    """
    Количество дверей в строке КП. Размер бывает разорван переносом — высота
    остаётся в строке, ширина уезжает на следующую, — и тогда из «2000»
    вычитались последние три цифры: количество становилось нулём. Заказ
    получал одну дверь с суммой за две.
    """

    def test_quantity_is_not_cut_out_of_the_height(self):
        from orders.pdf_parser import _fix_split_size, _parse_door_row

        anchor = 'Nord 1 ПО EVO Стекло MATELUX: белое 4 мм. 2 2000 2100*700 31500 63000'
        row = _parse_door_row(_fix_split_size(anchor, '800 900'))
        self.assertEqual(row['qty'], 2)
        self.assertEqual(row['door_height'], 2000)
        self.assertEqual(row['door_width'], 800)
        self.assertEqual(row['price'], Decimal('31500'))
        self.assertEqual(row['sum'], Decimal('63000'))

    def test_plain_row_is_unchanged(self):
        from orders.pdf_parser import _fix_split_size, _parse_door_row

        anchor = 'Полотно Epsilon 12 Капуччино 1 2000*800 900*2070*120 D 21000 21000'
        row = _parse_door_row(_fix_split_size(anchor, ''))
        self.assertEqual(row['qty'], 1)
        self.assertEqual(row['door_height'], 2000)
        self.assertEqual(row['door_width'], 800)

    def test_numbers_only_line_is_a_continuation_not_a_row(self):
        from orders.pdf_parser import _is_anchor_line

        self.assertFalse(_is_anchor_line('800 900'))
        self.assertTrue(_is_anchor_line('Петля карточная 4 * 2000 8000'))

    def test_row_survives_when_quantity_is_unreadable(self):
        """Потерять строку КП хуже, чем показать её одной штукой."""
        from orders.pdf_parser import _parse_door_row

        row = _parse_door_row('Полотно без количества 2000*800 21000 21000')
        self.assertIsNotNone(row)
        self.assertEqual(row['qty'], 1)
