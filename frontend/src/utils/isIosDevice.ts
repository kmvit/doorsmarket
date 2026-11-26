export const isIosDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const userAgent = navigator.userAgent || ''
  const isClassicIOS = /iPhone|iPad|iPod/.test(userAgent)
  const isTouchMac =
    /Macintosh/.test(userAgent) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document

  return isClassicIOS || isTouchMac
}
