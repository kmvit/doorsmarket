import { useEffect, useRef, useState } from 'react'
import docxScript from '../../../node_modules/docx-preview/dist/docx-preview.min.js?url'
import zipScript from 'jszip/dist/jszip.min.js?url'

const previewPage = (nonce: string) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">
  <style>
    body { margin: 0; background: #374151; }
    body .docx-wrapper { width: max-content; min-width: 100%; box-sizing: border-box; background: transparent; }
  </style>
  <script nonce="${nonce}" src="${zipScript}"></script>
  <script nonce="${nonce}" src="${docxScript}"></script>
  </head><body><div id="styles"></div><main></main><script nonce="${nonce}">
    window.addEventListener('message', async (event) => {
      if (event.source !== parent || !(event.data instanceof ArrayBuffer) || !event.ports[0]) return;
      const port = event.ports[0];
      try {
        const pages = document.querySelector('main');
        await docx.renderAsync(event.data, pages, document.getElementById('styles'), {
          renderAltChunks: false,
          useBase64URL: true,
        });
        pages.querySelectorAll('a[href]').forEach(link => link.removeAttribute('href'));
        port.postMessage(true);
      } catch {
        port.postMessage(false);
      } finally {
        port.close();
      }
    });
  </script></body></html>`

const DocxPages = ({ url }: { url: string }) => {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [srcDoc] = useState(() => previewPage(crypto.getRandomValues(new Uint32Array(4)).join('-')))
  const [frameLoaded, setFrameLoaded] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const frame = frameRef.current?.contentWindow
    if (!frameLoaded || !frame) return
    const controller = new AbortController()
    const channel = new MessageChannel()
    const timeout = window.setTimeout(() => {
      controller.abort()
      channel.port1.close()
      channel.port2.close()
      setStatus('failed')
    }, 30000)

    channel.port1.onmessage = ({ data }) => {
      window.clearTimeout(timeout)
      channel.port1.close()
      channel.port2.close()
      setStatus(data === true ? 'ready' : 'failed')
    }

    const load = async () => {
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load DOCX')
        const data = await response.arrayBuffer()
        // sandbox создаёт непрозрачный origin, поэтому ответ принимаем через выделенный порт.
        if (!controller.signal.aborted) frame.postMessage(data, '*', [data, channel.port2])
      } catch {
        if (!controller.signal.aborted) setStatus('failed')
      }
    }

    void load()
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
      channel.port1.close()
    }
  }, [frameLoaded, url])

  if (status === 'failed') {
    return <p role="alert" className="px-4 text-center text-sm text-gray-200">Не удалось показать документ Word. Его можно скачать кнопкой сверху.</p>
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {status === 'loading' && <p role="status" className="text-sm text-gray-200">Загружаем документ Word…</p>}
      <iframe ref={frameRef} title="Документ Word" sandbox="allow-scripts" srcDoc={srcDoc}
        onLoad={() => setFrameLoaded(true)} className={`absolute inset-0 h-full w-full border-0 ${status === 'loading' ? 'invisible' : ''}`} />
    </div>
  )
}

export default DocxPages
