import { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Окно поверх всей страницы. <main> в Layout — отдельный слой (relative z-10),
 * и окно внутри него не поднимается выше шапки и подвала: они остаются
 * незатемнёнными и наезжают на нижний лист на телефоне.
 */
const ModalPortal = ({ children }: { children: ReactNode }) => createPortal(children, document.body)

export default ModalPortal
