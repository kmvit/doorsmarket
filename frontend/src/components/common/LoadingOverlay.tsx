interface Props {
  message: string
  /** Доп. подсказка под основным текстом (необязательно) */
  hint?: string
}

/**
 * Полноэкранный модальный оверлей со спиннером — показывается во время долгих
 * операций (например, генерация PDF), чтобы пользователь не жал кнопку повторно.
 */
const LoadingOverlay = ({ message, hint }: Props) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
    <div className="bg-white rounded-2xl shadow-2xl px-6 py-5 flex items-center gap-4 max-w-sm">
      <div className="animate-spin h-7 w-7 border-[3px] border-primary-600 border-t-transparent rounded-full shrink-0" />
      <div>
        <div className="text-sm font-medium text-gray-900">{message}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </div>
  </div>
)

export default LoadingOverlay
