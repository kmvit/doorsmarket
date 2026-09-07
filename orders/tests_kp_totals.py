"""
Тесты разбора итогового блока КП (п.10 ТЗ «Формирование красивого КП»).

Формат подвала одинаков во всех КП фабрики, но с двумя ловушками:
число бывает приклеено к подписи («Итого968650.00»), а слева от подписи
попадает текст соседней колонки («Представитель Горизонт Итого…»).
"""
from decimal import Decimal

from django.test import SimpleTestCase

from orders.pdf_parser import TOTALS_KEYS, _extract_totals

# Подвал реального КП (40-284021-5_KP_Zemfira.pdf), как его отдаёт pdfplumber.
REAL_FOOTER = """Услуги Кол-во Цена Сумма
Доставка за КАД Кукмор 1 * 13750 13750
Занос в дом полотен до 2100 мм 11 * 700 7700
Стоимость товара:636900.00
Покупатель (Представитель) Стоимость стекла: 0.00
___________________________________________________ Стоимость изделий:310300.00
Стоимость услуг: 21450.00
Представитель Горизонт Итого968650.00
___________________________________________________ % 142080
Способ оплаты Общая стоимость826570.00
Дата Тип оплаты Предоплата 1 0.00
Предоплата 2 0.00
Остаток (до полной оплаты) 826570
"""


class ExtractTotalsTests(SimpleTestCase):
    def setUp(self):
        self.totals = _extract_totals(REAL_FOOTER)

    def test_all_amounts_parsed(self):
        self.assertEqual(self.totals['goods_amount'], Decimal('636900.00'))
        self.assertEqual(self.totals['glass_amount'], Decimal('0.00'))
        self.assertEqual(self.totals['products_amount'], Decimal('310300.00'))
        self.assertEqual(self.totals['services_amount'], Decimal('21450.00'))
        self.assertEqual(self.totals['discount_amount'], Decimal('142080'))

    def test_total_and_discounted_total_are_not_confused(self):
        # «Итого» и «Общая стоимость» стоят рядом и обе про итог —
        # но это суммы до и после скидки.
        self.assertEqual(self.totals['total_amount'], Decimal('968650.00'))
        self.assertEqual(self.totals['total_with_discount'], Decimal('826570.00'))

    def test_amounts_are_consistent(self):
        parts = (
            self.totals['goods_amount'] + self.totals['glass_amount']
            + self.totals['products_amount'] + self.totals['services_amount']
        )
        self.assertEqual(parts, self.totals['total_amount'])
        self.assertEqual(
            self.totals['total_amount'] - self.totals['discount_amount'],
            self.totals['total_with_discount'],
        )

    def test_prepayment_is_not_taken_as_total(self):
        # «Предоплата 1 0.00» тоже склеивается с числом — но это не итог.
        self.assertNotEqual(self.totals['total_with_discount'], Decimal('0.00'))

    def test_missing_footer_gives_none_not_zero(self):
        # В части КП итоги ещё не посчитаны — ноль и «не посчитано» это разное.
        totals = _extract_totals('Модель полотна Кол-во Размер\nNord 1 ПГ Милк 1 2100*700')
        self.assertEqual(set(totals), set(TOTALS_KEYS))
        self.assertTrue(all(value is None for value in totals.values()))

    def test_totals_taken_from_footer_not_from_table(self):
        # Слово «Итого» может встретиться и в теле документа — берём последний блок.
        text = 'Итого по разделу 111.00\n' + REAL_FOOTER
        totals = _extract_totals(text)
        self.assertEqual(totals['total_amount'], Decimal('968650.00'))
