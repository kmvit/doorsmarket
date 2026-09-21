"""
Тесты разбора шапки КП.

Адрес в КП — это подпись поля («Адрес доставки») и значение за ней, причём
в тексте PDF они идут подряд. Прежняя регулярка требовала, чтобы значение
начиналось с заглавной буквы, но с `IGNORECASE` это требование не работало,
и подпись затекала в значение: в заказ приезжало «доставки Каратау 18».
"""
from django.test import SimpleTestCase

from projects.pdf_parser import _extract_address

# Шапка КП так, как её отдаёт pdfplumber после склейки пробелов.
HEADER = (
    'Подразделение ТК Савиново, Казань, Ямашева, 93, салон м/к дверей Academy Light. '
    'тел. +7 917 892-52-43 Менеджер(Ф.И.О.) Сидорин Игорь Анатольевич '
    'Покупатель (Ф.И.О.) Репалова Ризида Маратовна '
    'Адрес доставки {address} '
    'Телефоны +79172519460 Email Комментарий Расчет предварительный'
)


class ExtractAddressTests(SimpleTestCase):
    def test_label_does_not_leak_into_the_value(self):
        self.assertEqual(_extract_address(HEADER.format(address='Каратау 18')), 'Каратау 18')

    def test_long_address_is_taken_whole(self):
        address = 'Кукморский район , п.Манзарас , ул. 1 мая, д. 40'
        self.assertEqual(_extract_address(HEADER.format(address=address)), address)

    def test_other_labels_are_eaten_too(self):
        for label in ('доставки', 'установки', 'монтажа', 'объекта'):
            with self.subTest(label=label):
                text = f'Покупатель (Ф.И.О.) Иванов Адрес {label} Каратау 18 Телефоны +79000000000'
                self.assertEqual(_extract_address(text), 'Каратау 18')

    def test_address_without_label_word(self):
        text = 'Покупатель (Ф.И.О.) Иванов Адрес: ул. Победы, 5 Телефоны +79000000000'
        self.assertEqual(_extract_address(text), 'ул. Победы, 5')

    def test_empty_address_stays_empty(self):
        """
        В КП адрес часто не заполнен: за подписью сразу идёт следующее поле.
        Телефон в адрес попадать не должен.
        """
        text = (
            'Покупатель (Ф.И.О.) Иванов Адрес доставки '
            'Телефоны +79172519460 Email Комментарий Замер от 18.09.26'
        )
        self.assertEqual(_extract_address(text), '')

    def test_delivery_address_wins_over_the_salon_one(self):
        """
        Адрес подразделения — запасной вариант на случай, когда адреса
        доставки в КП нет вовсе. Раньше он проверялся первым и подменял
        собой настоящий адрес клиента.
        """
        text = (
            'Подразделение г. Казань, ул. Ямашева д 93, ТК САВИНОВО, тел +7 917 000-00-00 '
            'Покупатель (Ф.И.О.) Иванов Адрес доставки ЖК Шаляпин '
            'Телефоны +79000000000'
        )
        self.assertEqual(_extract_address(text), 'ЖК Шаляпин')

    def test_salon_address_is_the_fallback(self):
        text = (
            'Подразделение г. Казань, ул. Ямашева д 93, ТК САВИНОВО, тел +7 917 000-00-00 '
            'Покупатель (Ф.И.О.) Иванов Телефоны +79000000000'
        )
        self.assertEqual(_extract_address(text), 'г. Казань, ул. Ямашева д 93, ТК САВИНОВО')
