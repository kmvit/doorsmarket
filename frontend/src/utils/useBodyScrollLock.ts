import { useEffect } from 'react'

/**
 * Блокирует прокрутку страницы, пока открыто модальное окно.
 *
 * Намеренно только `overflow: hidden`, без приёма с `position: fixed` на
 * body: на iOS body в fixed ломает позиционирование вложенных fixed-элементов
 * — само окно начинает ездить вместе со страницей.
 */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return

    const { body } = document
    const saved = body.style.overflow
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = saved
    }
  }, [locked])
}

export default useBodyScrollLock
