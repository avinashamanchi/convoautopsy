import { describe, expect, it } from 'vitest';

import { ProviderInvalidResponseError } from '../src/errors';
import { createGroqProvider } from '../src/provider';

describe('Groq adapter response validation', () => {
  it('maps malformed upstream HTTP JSON to an invalid provider response', async () => {
    const provider = createGroqProvider('test-only-key', async () => new Response(null, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderInvalidResponseError);
  });

  it('maps malformed provider content JSON to an invalid provider response', async () => {
    const provider = createGroqProvider('test-only-key', async () => Response.json({
      choices: [{ message: { content: '{not json' } }],
    }));

    await expect(provider.analyze([{ sender: 'Person A', text: 'hello' }])).rejects.toBeInstanceOf(ProviderInvalidResponseError);
  });
});
