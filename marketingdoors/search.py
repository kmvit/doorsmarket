"""
Общий поиск для списков (заказы, рекламации, замеры).

Пользователи ищут запись по её номеру так, как он показан в интерфейсе —
«#183» или просто «183». Штатный SearchFilter ищет подстроку как есть,
поэтому «#183» не находил ничего: решётки нет ни в одном поле. Здесь она
срезается, а поиск по числовым полям (id) работает обычным icontains.
"""
from rest_framework.filters import SearchFilter


class NumberAwareSearchFilter(SearchFilter):
    """SearchFilter, понимающий номер записи с решёткой: «#183» = «183»."""

    def get_search_terms(self, request):
        terms = super().get_search_terms(request)
        cleaned = []
        for term in terms:
            stripped = term.lstrip('#№').strip()
            cleaned.append(stripped if stripped else term)
        return cleaned
