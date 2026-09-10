// Красивое КП: презентационная версия заказа для клиента.

// Справочник дверей — им наполняется окно уточнения модели и цвета.
export interface DoorModelRef {
  id: number
  name: string
  series: number
  series_name: string
  aliases: string
}

export interface DoorColorRef {
  id: number
  name: string
  aliases: string
}

export interface DoorImageRef {
  id: number
  door_model: number
  model_name: string
  series_name: string
  color: number
  color_name: string
  variant: string
  image_url: string | null
  source: 'catalog' | 'manual'
}

// Почему сторона полотна не распозналась — из этого складывается подсказка
// менеджеру в окне уточнения.
export type MatchProblem =
  | 'model_not_found'
  | 'color_not_found'
  | 'no_image_for_color'
  | 'variant_ambiguous'

export const MATCH_PROBLEM_TEXT: Record<MatchProblem, string> = {
  model_not_found: 'Модель не найдена в каталоге',
  color_not_found: 'Цвет по КП не определён — выберите',
  no_image_for_color: 'Для этого цвета нет картинок',
  variant_ambiguous: 'Не указан вариант полотна',
}

export interface MatchSide {
  model_id: number | null
  model_name: string
  series_name: string
  color_id: number | null
  color_name: string
  variant: string
  image_id: number | null
  problems: MatchProblem[]
  variant_options: string[]
}

export interface MatchResult {
  source_text: string
  two_sided: boolean
  resolved: boolean
  front: MatchSide
  back: MatchSide | null
}

export interface Clarification {
  offer_item_id: number
  opening_number: number
  room_name: string
  model_name: string
  match: MatchResult
}

// Картинка, которую можно подтянуть в КП из уже вложенного в заказ или замер.
export interface SourceImage {
  kind: 'order_attachment' | 'measurement_attachment'
  id: number
  name: string
  url: string
  source: string
}

export interface PrettyOfferAttachment {
  id: number
  offer: number
  offer_item: number | null
  image_url: string | null
  caption: string
  position: number
}

export interface PrettyOfferItem {
  id: number
  offer: number
  order_item: number
  opening_number: number
  room_name: string
  model_name: string
  door_height: number | null
  door_width: number | null
  opening_type_display: string
  amount: string | null
  description: string
  preset: number | null
  two_sided: boolean
  front_image: number | null
  back_image: number | null
  front_image_detail: DoorImageRef | null
  back_image_detail: DoorImageRef | null
  front_image_url: string | null
  back_image_url: string | null
  needs_clarification: boolean
  attachments: PrettyOfferAttachment[]
  position: number
}

// Суммы, которые попадут в PDF: правка менеджера либо посчитанное из заказа.
export interface PrettyOfferTotals {
  goods_amount: string | null
  services_amount: string | null
  total_amount: string | null
  total_with_discount: string | null
}

export interface PrettyOffer {
  id: number
  order: number
  preset: number | null
  comment: string
  goods_amount_override: string | null
  services_amount_override: string | null
  total_amount_override: string | null
  total_with_discount_override: string | null
  totals: PrettyOfferTotals
  items: PrettyOfferItem[]
  attachments: PrettyOfferAttachment[]
  needs_clarification_count: number
  created_at: string
  updated_at: string
}

export interface OfferTextPreset {
  id: number
  name: string
  is_default: boolean
  header_text: string
  included_text: string
  features_text: string
}

export type TotalsOverrideField =
  | 'goods_amount_override'
  | 'services_amount_override'
  | 'total_amount_override'
  | 'total_with_discount_override'

// Подписи сумм в подвале КП и поля правок под ними (п.10 ТЗ).
export const TOTALS_ROWS: {
  key: keyof PrettyOfferTotals
  override: TotalsOverrideField
  label: string
}[] = [
  {
    key: 'goods_amount',
    override: 'goods_amount_override',
    label: 'Стоимость товара и изделий без скидки',
  },
  { key: 'services_amount', override: 'services_amount_override', label: 'Стоимость услуг' },
  { key: 'total_amount', override: 'total_amount_override', label: 'Итого без скидки' },
  {
    key: 'total_with_discount',
    override: 'total_with_discount_override',
    label: 'Итого со скидкой',
  },
]
