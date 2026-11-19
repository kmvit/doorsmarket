const VIDEO_EXTENSIONS = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'ogv']
const videoExtension = new RegExp(`\\.(${VIDEO_EXTENSIONS.join('|')})$`, 'i')

export const VIDEO_FILE_ACCEPT = ['video/*', ...VIDEO_EXTENSIONS.map((ext) => `.${ext}`)].join(',')

export const isVideoFile = (value: string): boolean => videoExtension.test(value.split(/[?#]/, 1)[0])
