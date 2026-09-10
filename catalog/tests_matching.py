"""
Тесты сопоставления «Модель полотна» из КП с каталогом.

Строки взяты из реальных КП в `documentanions/` — это и есть эталон того,
что матчер обязан разбирать.
"""
import unicodedata

from django.test import SimpleTestCase

from catalog.matching import CatalogEntry, CatalogIndex, match_model_name
from catalog.normalize import normalize


def build_test_index() -> CatalogIndex:
    """Мини-каталог: модели и цвета, встречающиеся в тестовых КП."""
    models = [
        CatalogEntry.build(1, 'Piana', series_name='Классика'),
        CatalogEntry.build(2, 'Nord', series_name='Модерн'),
        CatalogEntry.build(3, 'SKY', series_name='Модерн'),
        CatalogEntry.build(4, 'Color P', series_name='Модерн'),
        CatalogEntry.build(5, 'Epsilon', series_name='Модерн'),
    ]
    colors = [
        CatalogEntry.build(10, 'Орех натуральный'),
        CatalogEntry.build(11, 'Дуб натуральный'),
        CatalogEntry.build(12, 'Грунт'),
        CatalogEntry.build(13, 'Зеркало серебро'),
        CatalogEntry.build(14, 'Милк ZB 810 EVO', aliases=['Милк']),
        CatalogEntry.build(15, 'Капучино'),
        CatalogEntry.build(16, 'Дуб антик'),
        CatalogEntry.build(17, 'Дуб'),
    ]
    images = {
        (1, 10): {'1': 100},
        (2, 14): {'1': 200, '2': 201},
        (3, 12): {'': 300},
        (3, 13): {'': 301},
        (4, 12): {'': 400},
        (5, 15): {'1': 500, '12': 501},
        (5, 16): {'1': 502},
        (1, 11): {'1': 101},
    }
    return CatalogIndex(models, colors, images)


class NormalizeTests(SimpleTestCase):
    def test_case_and_yo_are_ignored(self):
        self.assertEqual(normalize('Морёный дуб'), normalize('мореный ДУБ'))

    def test_doubled_letters_collapse(self):
        self.assertEqual(normalize('Капуччино'), normalize('Капучино'))

    def test_cyrillic_lookalikes_fold_to_latin(self):
        # «Nord» латиницей и «N\u043Erd» с кириллической «о» — одно и то же.
        self.assertEqual(normalize('N\u043Erd'), normalize('Nord'))

    def test_macos_decomposed_letters_match(self):
        # macOS отдаёт имена папок в NFD: «й» = «и» + надстрочный знак.
        decomposed = unicodedata.normalize('NFD', 'Мелинга серый')
        self.assertNotEqual(decomposed, 'Мелинга серый')
        self.assertEqual(normalize(decomposed), normalize('Мелинга серый'))

    def test_punctuation_dropped(self):
        self.assertEqual(normalize('Piana 1 PG верт. 60мм'), 'piana 1 pg bept 60m')


class MatchModelNameTests(SimpleTestCase):
    def setUp(self):
        self.index = build_test_index()

    def test_single_sided_with_variant(self):
        result = match_model_name('Nord 1 ПГ Милк ZB 810 EVO ДП8', self.index)
        self.assertFalse(result.two_sided)
        self.assertEqual(result.front.model.name, 'Nord')
        self.assertEqual(result.front.color.name, 'Милк ZB 810 EVO')
        self.assertEqual(result.front.variant, '1')
        self.assertEqual(result.front.image_pk, 200)
        self.assertTrue(result.is_resolved)

    def test_model_found_inside_noisy_description(self):
        text = ('Полотоно Piana 1 PG верт. 50мм орех натуральный шпон Д2 Сан.узел')
        result = match_model_name(text, self.index)
        self.assertEqual(result.front.model.name, 'Piana')
        self.assertEqual(result.front.color.name, 'Орех натуральный')
        self.assertEqual(result.front.image_pk, 100)

    def test_longest_color_name_wins(self):
        # «Дуб антик» не должен схлопнуться в «Дуб».
        result = match_model_name('Epsilon 1 Дуб антик', self.index)
        self.assertEqual(result.front.color.name, 'Дуб антик')
        self.assertEqual(result.front.image_pk, 502)

    def test_color_alias_matches(self):
        result = match_model_name('Nord 2 ПО Милк стекло прозрачное', self.index)
        self.assertEqual(result.front.color.name, 'Милк ZB 810 EVO')
        self.assertEqual(result.front.image_pk, 201)

    def test_explicit_face_and_back_markers(self):
        text = ('SKY. Лицо -Грунт , Оборот-Зеркало серебро(обычное) . 65мм. '
                'Алюминиевая кромка с 4 сторон. Двухсторонняя Д5')
        result = match_model_name(text, self.index)
        self.assertTrue(result.two_sided)
        self.assertEqual(result.front.color.name, 'Грунт')
        self.assertEqual(result.back.color.name, 'Зеркало серебро')
        # Модель написана один раз до маркеров — общая для обеих сторон.
        self.assertEqual(result.front.model.name, 'SKY')
        self.assertEqual(result.back.model.name, 'SKY')
        self.assertEqual(result.front.image_pk, 300)
        self.assertEqual(result.back.image_pk, 301)

    def test_face_color_also_named_before_markers(self):
        # Цвет лица часто повторяют до маркеров — он не должен теряться.
        text = 'Epsilon 1 Дуб антик. Лицо -Дуб антик , Оборот-Капучино. Двухсторонняя'
        result = match_model_name(text, self.index)
        self.assertTrue(result.two_sided)
        self.assertEqual(result.front.color.name, 'Дуб антик')
        self.assertEqual(result.front.image_pk, 502)
        self.assertEqual(result.back.color.name, 'Капучино')

    def test_uppercase_face_back_labels(self):
        text = ('БЛОК 1. Piana 1 PG верт 50 мм. Кромка РАЛ 9005 с 4-х сторон. '
                'Полотно с двусторонней отделкой. ЛИЦО: Орех натуральный, '
                'ОБОРОТ: Дуб натуральный.')
        result = match_model_name(text, self.index)
        self.assertTrue(result.two_sided)
        self.assertEqual(result.front.color.name, 'Орех натуральный')
        self.assertEqual(result.back.color.name, 'Дуб натуральный')
        self.assertTrue(result.is_resolved)

    def test_same_color_both_sides_is_not_two_sided(self):
        # «Грунт с 2 сторон» — цвет один, картинка одна.
        text = 'Color P грунт 50мм. Алюминиевая кромка с 4 сторон. Грунт с 2 сторон Д6'
        result = match_model_name(text, self.index)
        self.assertFalse(result.two_sided)
        self.assertIsNone(result.back)
        self.assertEqual(result.front.image_pk, 400)

    def test_two_colors_without_markers_mean_two_sided(self):
        result = match_model_name('Piana 1 PG Орех натуральный и Дуб натуральный шпон', self.index)
        self.assertTrue(result.two_sided)
        self.assertEqual(result.front.color.name, 'Орех натуральный')
        self.assertEqual(result.back.color.name, 'Дуб натуральный')

    def test_unknown_model_needs_clarification(self):
        result = match_model_name('Дверь Unknown 5 Розовый', self.index)
        self.assertFalse(result.is_resolved)
        self.assertIn('model_not_found', result.front.problems)
        self.assertIn('color_not_found', result.front.problems)

    def test_ambiguous_variant_asks_manager(self):
        # У Epsilon в Капучино два варианта, а в строке номера нет.
        result = match_model_name('Epsilon Капуччино', self.index)
        self.assertFalse(result.is_resolved)
        self.assertIn('variant_ambiguous', result.front.problems)
        self.assertEqual(result.front.variant_options, ['1', '12'])

    def test_unknown_variant_number_falls_back_to_choice(self):
        # В каталоге у Epsilon в Капучино нет варианта 7 — предлагаем менеджеру
        # выбрать из тех, что есть, а не показываем ошибку.
        result = match_model_name('Epsilon 7 Капучино', self.index)
        self.assertIn('variant_ambiguous', result.front.problems)
        self.assertEqual(result.front.variant_options, ['1', '12'])

    def test_article_code_variant_found_anywhere_in_text(self):
        # Артикул с буквами ищем по всей строке: «Alfa ... AC47 ... Венге».
        index = CatalogIndex(
            models=[CatalogEntry.build(1, 'Alfa', series_name='Модерн')],
            colors=[CatalogEntry.build(2, 'Венге')],
            images={(1, 2): {'AC36': 10, 'AC47': 11}},
        )
        result = match_model_name('Полотно Alfa AC47 венге 40мм Д3', index)
        self.assertEqual(result.front.variant, 'AC47')
        self.assertEqual(result.front.image_pk, 11)

    def test_article_code_repeating_model_name(self):
        index = CatalogIndex(
            models=[CatalogEntry.build(1, 'Torino', series_name='Модерн')],
            colors=[CatalogEntry.build(2, 'RAL Avorio')],
            images={(1, 2): {'Torino TR 702': 10, 'Torino TR 709': 11}},
        )
        result = match_model_name('Torino TR 709 RAL Avorio 2100*800', index)
        self.assertEqual(result.front.variant, 'Torino TR 709')
        self.assertEqual(result.front.image_pk, 11)

    def test_thickness_is_not_taken_as_variant(self):
        # «SKY 65 мм» — 65 это толщина полотна, а не номер рисунка.
        result = match_model_name('SKY 65 мм Грунт', self.index)
        self.assertEqual(result.front.variant, '')
        self.assertEqual(result.front.image_pk, 300)

    def test_no_image_for_known_pair(self):
        result = match_model_name('SKY Капучино', self.index)
        self.assertIn('no_image_for_color', result.front.problems)

    def test_model_without_colors_does_not_ask_about_color(self):
        """
        У Secret каталог не разбит по цветам — выбирать менеджеру не из чего,
        и спрашивать про цвет незачем.
        """
        index = CatalogIndex(
            models=[CatalogEntry.build(1, 'Secret', series_name='Без покрытия')],
            colors=[CatalogEntry.build(2, 'Без цвета')],
            images={(1, 2): {'Secret 7': 10, 'Secret 8': 11}},
            placeholder_color_pks=frozenset({2}),
        )
        result = match_model_name('Secret 7 2100*900 ДП3', index)
        self.assertTrue(result.is_resolved)
        self.assertEqual(result.front.color.name, 'Без цвета')
        self.assertEqual(result.front.variant, 'Secret 7')
        self.assertEqual(result.front.image_pk, 10)

    def test_color_is_not_guessed_when_model_has_real_colors(self):
        """Если у модели есть настоящие цвета, подставлять один за менеджера нельзя."""
        index = CatalogIndex(
            models=[CatalogEntry.build(1, 'Alfa', series_name='Модерн')],
            colors=[CatalogEntry.build(2, 'Венге')],
            images={(1, 2): {'AC36': 10}},
        )
        result = match_model_name('Alfa AC36 неизвестный цвет', index)
        self.assertIn('color_not_found', result.front.problems)

    def test_to_dict_shape(self):
        data = match_model_name('Nord 1 ПГ Милк', self.index).to_dict()
        self.assertTrue(data['resolved'])
        self.assertEqual(data['front']['model_name'], 'Nord')
        self.assertIsNone(data['back'])
