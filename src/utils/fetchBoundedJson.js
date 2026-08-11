const DEFAULT_TIMEOUT_MS = 20_000
export const MAX_UPSTREAM_RESPONSE_BYTES = 256 * 1024

function abortError() {
  return new DOMException('Request cancelled', 'AbortError')
}

export async function fetchBoundedJson(url, init, options = {}) {
  const callerSignal = options.signal
  if (callerSignal?.aborted) throw abortError()

  const controller = new AbortController()
  let rejectCancellation
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject })
  const abort = () => {
    rejectCancellation(abortError())
    controller.abort()
  }
  const timeout = () => {
    rejectCancellation(new Error('timeout'))
    controller.abort()
  }
  callerSignal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(timeout, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  try {
    const response = await Promise.race([
      fetch(url, { ...init, signal: controller.signal }),
      cancellation,
    ])
    const data = await readBoundedJson(
      response,
      cancellation,
      options.maxResponseBytes ?? MAX_UPSTREAM_RESPONSE_BYTES,
    )
    return { response, data }
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', abort)
  }
}

function cancelBody(body) {
  if (!body) return
  try {
    void body.cancel().catch(() => undefined)
  } catch {
    // Cancellation is best effort; rejection must not extend the request deadline.
  }
}

export async function readBoundedJson(response, cancellation, maxBytes) {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    cancelBody(response.body)
    throw new Error('response too large')
  }
  if (!response.body) throw new Error('missing response body')

  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  let cancellationStarted = false
  const cancelReader = () => {
    if (cancellationStarted) return
    cancellationStarted = true
    try {
      void reader.cancel().catch(() => undefined)
    } catch {
      // Cancellation is best effort; rejection must not extend the request deadline.
    }
  }
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), cancellation])
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        cancelReader()
        throw new Error('response too large')
      }
      chunks.push(value)
    }
  } catch (error) {
    cancelReader()
    throw error
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
