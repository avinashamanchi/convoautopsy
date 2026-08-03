import {
  AnalysisMessageSchema,
  normalizeAnalysisProviderOutput,
  ResponseDraftSchema,
  type AnalysisResult,
  type AnalyzeRequest,
  type ResponseDraft,
} from './contract';
import { ProviderInvalidResponseError, ProviderUnavailableError } from './errors';
import { z } from 'zod';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 256 * 1024;

const ProviderCraftInputSchema = z.object({
  sender: z.string().regex(/^Person [A-Z]$/),
  goal: z.enum(['resolve', 'boundary', 'feelings', 'understand', 'apologize', 'request']),
  tone: z.enum(['empathetic', 'assertive', 'deescalating', 'direct', 'diplomatic']),
  analysis: z.object({
    intensityScore: z.number().int().min(0).max(100),
    conflictMode: z.enum([
      'Competing',
      'Avoiding',
      'Compromising',
      'Collaborating',
      'Accommodating',
      'Competing vs Avoiding',
    ]),
    messages: z.array(AnalysisMessageSchema).min(1).max(100),
  }).strict(),
}).strict();

export type ProviderCraftInput = z.infer<typeof ProviderCraftInputSchema>;

export interface AiProvider {
  analyze(messages: AnalyzeRequest['messages']): Promise<AnalysisResult>;
  craftResponse(input: ProviderCraftInput): Promise<ResponseDraft>;
}

type FetchLike = typeof fetch;
type ProviderOptions = { timeoutMs?: number; maxResponseBytes?: number };

export function createGroqProvider(apiKey: string, fetcher: FetchLike = fetch, options: ProviderOptions = {}): AiProvider {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  return {
    async analyze(messages) {
      const output = await requestCompletion(fetcher, apiKey, {
        messages: [
          { role: 'system', content: 'Return only JSON matching the analysis result contract. Do not include markdown.' },
          { role: 'user', content: JSON.stringify({ messages }) },
        ],
        max_completion_tokens: 2_000,
      }, timeoutMs, maxResponseBytes);
      try {
        return normalizeAnalysisProviderOutput(output);
      } catch {
        throw new ProviderInvalidResponseError();
      }
    },
    async craftResponse(input) {
      const minimizedInput = ProviderCraftInputSchema.parse(input);
      const output = await requestCompletion(fetcher, apiKey, {
        messages: [
          { role: 'system', content: 'Return only JSON matching the response draft contract. Do not include markdown.' },
          { role: 'user', content: JSON.stringify(minimizedInput) },
        ],
        max_completion_tokens: 700,
      }, timeoutMs, maxResponseBytes);
      try {
        return ResponseDraftSchema.parse(output);
      } catch {
        throw new ProviderInvalidResponseError();
      }
    },
  };
}

async function requestCompletion(
  fetcher: FetchLike,
  apiKey: string,
  payload: { messages: Array<{ role: string; content: string }>; max_completion_tokens: number },
  timeoutMs: number,
  maxResponseBytes: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, ...payload }),
      signal: controller.signal,
    });
    if (!response.ok) {
      cancelBody(response.body);
      throw new ProviderUnavailableError();
    }
    let result: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      const bytes = await readBoundedResponse(response, controller.signal, maxResponseBytes);
      result = JSON.parse(new TextDecoder().decode(bytes)) as { choices?: Array<{ message?: { content?: unknown } }> };
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if (error instanceof ProviderInvalidResponseError) throw error;
      throw new ProviderInvalidResponseError();
    }
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new ProviderInvalidResponseError();
    try {
      return JSON.parse(content);
    } catch {
      throw new ProviderInvalidResponseError();
    }
  } catch (error) {
    if (error instanceof ProviderUnavailableError || error instanceof ProviderInvalidResponseError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new ProviderUnavailableError();
    }
    throw new ProviderUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

function cancelBody(body: ReadableStream<Uint8Array> | null): void {
  if (!body) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Cancellation is best effort; rejection must not extend the request deadline.
  }
}

export async function readBoundedResponse(response: Response, signal: AbortSignal, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    cancelBody(response.body);
    throw new ProviderInvalidResponseError();
  }
  if (!response.body) throw new ProviderInvalidResponseError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancellationStarted = false;
  const cancelReader = () => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    try {
      void reader.cancel().catch(() => undefined);
    } catch {
      // Cancellation is best effort; rejection must not extend the request deadline.
    }
  };
  let rejectAbort: ((reason: DOMException) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => {
    rejectAbort?.(new DOMException('Provider request timed out', 'AbortError'));
    cancelReader();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (signal.aborted) throw new DOMException('Provider request timed out', 'AbortError');
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        cancelReader();
        throw new ProviderInvalidResponseError();
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
