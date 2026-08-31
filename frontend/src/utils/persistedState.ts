import { useEffect, useRef, useState } from 'react'

/**
 * useState, который переживает уход со страницы и перезагрузку вкладки.
 *
 * Нужен для фильтров списков: менеджер ставит галочку «мои», открывает карточку,
 * возвращается назад — и фильтр должен остаться. Обычный useState умирает вместе
 * с размонтированием страницы.
 *
 * Храним в sessionStorage: значение живёт, пока открыта вкладка (или PWA), но не
 * тянется в следующие дни — иначе легко забыть про включённый фильтр и решить,
 * что список «потерял» заказы.
 */
const PREFIX = 'filters:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    // Приватный режим или повреждённое значение — работаем как обычный useState
    return fallback
  }
}

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial))

  // Ключ фиксируем в ref: он не меняется за жизнь компонента, но так эффект
  // записи не зависит от него и не срабатывает лишний раз.
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + keyRef.current, JSON.stringify(value))
    } catch {
      // Переполнение или запрет хранилища — фильтр просто не сохранится
    }
  }, [value])

  return [value, setValue] as const
}
