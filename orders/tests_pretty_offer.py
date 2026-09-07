"""
E2E-тест красивого КП: кнопка «сформировать» → подбор картинок из каталога →
уточнение по проёму → PDF.

Запуск (роль Postgres не умеет создавать БД, поэтому через sqlite):
    DATABASE_ENGINE=django.db.backends.sqlite3 DATABASE_NAME=/tmp/t.sqlite3 \\
        python manage.py test orders.tests_pretty_offer
"""
import io
import shutil
import tempfile
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from catalog.models import DoorColor, DoorImage, DoorModel, DoorSeries
from orders.models import (
    OfferTextPreset,
    Order,
    OrderAttachment,
    OrderItem,
    OrderStatus,
    PrettyOffer,
    Salon,
)
from users.models import City

User = get_user_model()

MEDIA_ROOT = tempfile.mkdtemp(prefix='pretty-offer-test-')


def make_png(color=(200, 170, 130)) -> bytes:
    """Маленькая картинка-заглушка: настоящие jpg каталога тесту не нужны."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new('RGB', (46, 100), color).save(buffer, format='PNG')
    return buffer.getvalue()


def upload(name: str, color=(200, 170, 130)) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, make_png(color), content_type='image/png')


@override_settings(MEDIA_ROOT=MEDIA_ROOT)
class PrettyOfferFlowTest(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.city = City.objects.create(name='Казань')
        self.salon = Salon.objects.create(name='Салон', city=self.city)
        self.manager = User.objects.create_user(
            username='mgr', password='x', role='manager', city=self.city, salon=self.salon,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

        # Каталог: Epsilon в двух цветах, у Капучино два варианта полотна.
        series = DoorSeries.objects.create(name='Модерн')
        self.model = DoorModel.objects.create(series=series, name='Epsilon')
        self.capuccino = DoorColor.objects.create(name='Капучино')
        self.oak = DoorColor.objects.create(name='Дуб антик')
        self.img_1 = DoorImage.objects.create(
            door_model=self.model, color=self.capuccino, variant='1', image=upload('1.png'),
        )
        self.img_12 = DoorImage.objects.create(
            door_model=self.model, color=self.capuccino, variant='12', image=upload('12.png'),
        )
        self.img_oak = DoorImage.objects.create(
            door_model=self.model, color=self.oak, variant='1', image=upload('oak.png'),
        )

        self.order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Земфира',
            kp_number='40-284021-5', status=OrderStatus.ACTIVE,
            goods_amount=Decimal('636900'), products_amount=Decimal('310300'),
            glass_amount=Decimal('0'), services_amount=Decimal('21450'),
            total_amount=Decimal('968650'), discount_amount=Decimal('142080'),
            total_with_discount=Decimal('826570'),
        )
        # Проём 1 — распознаётся целиком; проём 2 — вариант не указан, нужно
        # уточнение; проём 3 — модели вообще нет в каталоге.
        self.item_ok = OrderItem.objects.create(
            order=self.order, opening_number=1, room_name='Спальня',
            model_name='Полотно Epsilon 12 Капуччино 2000*800 Д1',
            door_height=2000, door_width=800, amount=Decimal('31500'), position=0,
        )
        self.item_ambiguous = OrderItem.objects.create(
            order=self.order, opening_number=2, room_name='Кухня',
            model_name='Полотно Epsilon Капучино 2100*700 Д2',
            door_height=2100, door_width=700, amount=Decimal('25500'), position=1,
        )
        self.item_unknown = OrderItem.objects.create(
            order=self.order, opening_number=3, room_name='Санузел',
            model_name='Некая дверь Розовый перламутр',
            door_height=2000, door_width=600, position=2,
        )

    # ---------- сборка ----------

    def test_build_creates_offer_and_matches_what_it_can(self):
        response = self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        self.assertEqual(response.status_code, 201, response.data)

        offer = PrettyOffer.objects.get(order=self.order)
        self.assertEqual(offer.items.count(), 3)
        self.assertEqual(offer.created_by, self.manager)
        # Пресет по умолчанию подставился из справочника.
        self.assertIsNotNone(offer.preset)

        by_opening = {item.order_item.opening_number: item for item in offer.items.all()}
        self.assertEqual(by_opening[1].front_image_id, self.img_12.pk)
        self.assertFalse(by_opening[1].needs_clarification)
        # Вариант не указан — картинку не выдумываем.
        self.assertIsNone(by_opening[2].front_image_id)
        self.assertTrue(by_opening[2].needs_clarification)
        self.assertTrue(by_opening[3].needs_clarification)
        self.assertEqual(response.data['needs_clarification_count'], 2)

    def test_rebuild_keeps_manager_choices_and_picks_up_new_openings(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)
        item = offer.items.get(order_item=self.item_ambiguous)
        self.client.patch(
            f'/api/v1/pretty-offer-items/{item.pk}/',
            {'front_image': self.img_1.pk, 'description': 'Стекло бронза'},
            format='json',
        )
        OrderItem.objects.create(
            order=self.order, opening_number=4, room_name='Гардероб',
            model_name='Полотно Epsilon 1 Дуб антик', position=3,
        )

        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')

        item.refresh_from_db()
        self.assertEqual(item.front_image_id, self.img_1.pk)
        self.assertEqual(item.description, 'Стекло бронза')
        self.assertEqual(offer.items.count(), 4)
        new_item = offer.items.get(order_item__opening_number=4)
        self.assertEqual(new_item.front_image_id, self.img_oak.pk)

    def test_removed_order_item_drops_out_of_offer(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        self.item_unknown.delete()
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)
        self.assertEqual(offer.items.count(), 2)

    # ---------- окно уточнения ----------

    def test_clarifications_report_what_was_recognised(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        response = self.client.get(
            f'/api/v1/orders/{self.order.pk}/pretty-offer/clarifications/'
        )
        self.assertEqual(response.status_code, 200)
        by_opening = {row['opening_number']: row for row in response.data}
        self.assertEqual(set(by_opening), {2, 3})

        ambiguous = by_opening[2]['match']['front']
        self.assertEqual(ambiguous['model_name'], 'Epsilon')
        self.assertEqual(ambiguous['color_name'], 'Капучино')
        self.assertIn('variant_ambiguous', ambiguous['problems'])
        self.assertEqual(ambiguous['variant_options'], ['1', '12'])

        unknown = by_opening[3]['match']['front']
        self.assertIn('model_not_found', unknown['problems'])

    def test_manager_upload_resolves_opening(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)
        item = offer.items.get(order_item=self.item_unknown)

        response = self.client.patch(
            f'/api/v1/pretty-offer-items/{item.pk}/',
            {'front_custom_image': upload('custom.png')},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200, response.data)
        item.refresh_from_db()
        self.assertFalse(item.needs_clarification)

    def test_two_sided_needs_both_pictures(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)
        item = offer.items.get(order_item=self.item_ok)
        self.client.patch(
            f'/api/v1/pretty-offer-items/{item.pk}/', {'two_sided': True}, format='json',
        )
        item.refresh_from_db()
        self.assertTrue(item.needs_clarification)

        self.client.patch(
            f'/api/v1/pretty-offer-items/{item.pk}/',
            {'back_image': self.img_oak.pk}, format='json',
        )
        item.refresh_from_db()
        self.assertFalse(item.needs_clarification)

    # ---------- суммы ----------

    def test_totals_come_from_order_and_can_be_overridden(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)

        totals = offer.resolved_totals()
        # Товар и изделия в красивом КП идут одной строкой.
        self.assertEqual(totals['goods_amount'], Decimal('947200'))
        self.assertEqual(totals['services_amount'], Decimal('21450'))
        self.assertEqual(totals['total_amount'], Decimal('968650'))
        self.assertEqual(totals['total_with_discount'], Decimal('826570'))

        response = self.client.patch(
            f'/api/v1/pretty-offers/{offer.pk}/',
            {'total_with_discount_override': '800000', 'comment': 'Скидка до конца месяца'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        offer.refresh_from_db()
        self.assertEqual(offer.resolved_totals()['total_with_discount'], Decimal('800000'))
        # Остальные суммы остались посчитанными из заказа.
        self.assertEqual(offer.resolved_totals()['total_amount'], Decimal('968650'))

    def test_totals_stay_empty_when_kp_has_none(self):
        empty_order = Order.objects.create(
            manager=self.manager, salon=self.salon, client_name='Без итогов',
            status=OrderStatus.ACTIVE,
        )
        OrderItem.objects.create(order=empty_order, opening_number=1, model_name='X')
        self.client.post(f'/api/v1/orders/{empty_order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=empty_order)
        self.assertIsNone(offer.resolved_totals()['goods_amount'])
        self.assertIsNone(offer.resolved_totals()['total_amount'])

    # ---------- дополнительные картинки ----------

    def test_image_can_be_pulled_from_order_attachments(self):
        attachment = OrderAttachment.objects.create(
            order=self.order, file=upload('scheme.png'), name='Схема',
        )
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)

        sources = self.client.get(
            f'/api/v1/orders/{self.order.pk}/pretty-offer/source-images/'
        )
        self.assertEqual(sources.status_code, 200)
        self.assertEqual(len(sources.data), 1)
        self.assertEqual(sources.data[0]['kind'], 'order_attachment')

        response = self.client.post(
            f'/api/v1/pretty-offers/{offer.pk}/add-image/',
            {'kind': 'order_attachment', 'source_id': attachment.pk}, format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(offer.attachments.count(), 1)

        # Копия, а не ссылка: удаление исходника не ломает КП.
        copied = offer.attachments.first()
        attachment.delete()
        copied.refresh_from_db()
        self.assertTrue(copied.image.storage.exists(copied.image.name))

    def test_image_can_be_uploaded_to_a_single_opening(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)
        item = offer.items.get(order_item=self.item_ok)

        response = self.client.post(
            f'/api/v1/pretty-offers/{offer.pk}/add-image/',
            {'image': upload('draft.png'), 'offer_item': item.pk, 'caption': 'Чертёж'},
            format='multipart',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(item.attachments.count(), 1)
        # К КП в целом такая картинка не относится.
        self.assertEqual(offer.attachments.filter(offer_item__isnull=True).count(), 0)

    # ---------- PDF ----------

    def test_pdf_has_a_slide_per_opening(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        response = self.client.get(f'/api/v1/orders/{self.order.pk}/pretty-offer/pdf/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')

        pdf = b''.join(response.streaming_content) if response.streaming else response.content
        self.assertTrue(pdf.startswith(b'%PDF'))

        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf)) as document:
            # Обложка + три проёма + итоги + «о компании» (2) + контакты.
            self.assertEqual(len(document.pages), 8)
            text = '\n'.join((page.extract_text() or '') for page in document.pages)
        # Извлечённый из PDF текст переносится по строкам колонок — сравниваем
        # по строке без переносов, иначе тест ловит вёрстку, а не содержимое.
        flat = ' '.join(text.split())

        self.assertIn('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', text)
        self.assertIn('Земфира', text)
        self.assertIn('Проём № 1 — Спальня', text)
        # Полное название модели из КП, как требует п.8 ТЗ.
        self.assertIn('Полотно Epsilon 12 Капуччино', flat)
        self.assertIn('2000*800 Д1', flat)
        # Фиксированные тексты из пресета.
        self.assertIn('В стоимость комплекта входит', text)
        # Итоги.
        self.assertIn('Итого со скидкой', text)
        # Постоянные слайды шаблона: о компании и контакты.
        self.assertIn('О КОМПАНИИ', text)
        self.assertIn('Компания основана в 1991 году', flat)
        self.assertIn('Торгово-производственная компания ACADEMY', flat)

    def test_pdf_marks_openings_without_a_picture(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        response = self.client.get(f'/api/v1/orders/{self.order.pk}/pretty-offer/pdf/')
        pdf = response.content

        import pdfplumber
        with pdfplumber.open(io.BytesIO(pdf)) as document:
            text = '\n'.join((page.extract_text() or '') for page in document.pages)
        self.assertIn('уточните модель и цвет', text)

    def test_pdf_requires_offer_to_exist(self):
        response = self.client.get(f'/api/v1/orders/{self.order.pk}/pretty-offer/pdf/')
        self.assertEqual(response.status_code, 404)

    # ---------- доступ ----------

    def test_offer_of_another_salon_is_not_visible(self):
        self.client.post(f'/api/v1/orders/{self.order.pk}/pretty-offer/')
        offer = PrettyOffer.objects.get(order=self.order)

        other_salon = Salon.objects.create(name='Чужой салон', city=self.city)
        stranger = User.objects.create_user(
            username='other', password='x', role='manager',
            city=self.city, salon=other_salon,
        )
        stranger_client = APIClient()
        stranger_client.force_authenticate(stranger)

        response = stranger_client.patch(
            f'/api/v1/pretty-offers/{offer.pk}/', {'comment': 'взлом'}, format='json',
        )
        self.assertEqual(response.status_code, 404)


class OfferTextPresetTest(TestCase):
    def test_seeded_presets_exist(self):
        # Тексты слайдов заведены миграцией по образцу шаблона.
        self.assertTrue(OfferTextPreset.objects.filter(name='EVO', is_default=True).exists())
        preset = OfferTextPreset.objects.get(name='EVO')
        self.assertIn('Полотно глухое высота 2000/2100 мм', preset.included_lines())
        self.assertIn('Толщина полотна 40 мм', preset.feature_lines())
