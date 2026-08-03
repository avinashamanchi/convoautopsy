import {
  normalizeAnalysisProviderOutput,
  ResponseDraftSchema,
  type AnalysisResult,
  type AnalyzeRequest,
  type CraftResponseRequest,
  type ResponseDraft,
} from './contract';
import { ProviderInvalidResponseError, ProviderUnavailableError } from './errors';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 20_000;

export interface AiProvider {
  analyze(messages: AnalyzeRequest['messages']): Promise<AnalysisResult>;
  craftResponse(input: CraftResponseRequest): Promise<ResponseDraft>;
}

type FetchLike = typeof fetch;

export function createGroqProvider(apiKey: string, fetcher: FetchLike = fetch): AiProvider {
  return {
    async analyze(messages) {
      const output = await requestCompletion(fetcher, apiKey, {
        messages: [
          { role: 'system', content: 'Return only JSON matching the analysis result contract. Do not include markdown.' },
          { role: 'user', content: JSON.stringify({ messages }) },
        ],
        max_tokens: 2_000,
      });
      try {
        return normalizeAnalysisProviderOutput(output);
      } catch {
        throw new ProviderInvalidResponseError();
      }
    },
    async craftResponse(input) {
      const output = await requestCompletion(fetcher, apiKey, {
        messages: [
          { role: 'system', content: 'Return only JSON matching the response draft contract. Do not include markdown.' },
          { role: 'user', content: JSON.stringify(input) },
        ],
        max_tokens: 700,
      });
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
  payload: { messages: Array<{ role: string; content: string }>; max_tokens: number },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, response_format: { type: 'json_object' }, ...payload }),
      signal: controller.signal,
    });
    if (!response.ok) throw new ProviderUnavailableError();
    let result: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      result = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    } catch {
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
    if (error instanceof DOMException && error.name === 'AbortError') throw new ProviderUnavailableError();
    throw new ProviderUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}
