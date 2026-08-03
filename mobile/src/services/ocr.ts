import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeOcr = { recognizeText(uri: string): Promise<string> };

const nativeOcr = requireOptionalNativeModule<NativeOcr>('ConvoOcr');

export const isOcrAvailable = () => nativeOcr !== null;

export async function recognizeConversationText(uri: string): Promise<string> {
  if (!nativeOcr) throw new Error('OCR_UNAVAILABLE');

  try {
    const text = await nativeOcr.recognizeText(uri);
    if (!text.trim()) throw new Error('OCR_EMPTY');
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === 'OCR_EMPTY') throw error;
    throw new Error('OCR_FAILED');
  }
}
