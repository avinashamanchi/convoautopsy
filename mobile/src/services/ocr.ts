import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeOcr = { recognizeText(uri: string): Promise<string> };
type NativeOcrErrorCode = 'OCR_IMAGE_UNREADABLE' | 'OCR_RECOGNITION_FAILED';

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
    const nativeCode = getNativeOcrErrorCode(error);
    if (nativeCode) throw new Error(nativeCode);
    throw new Error('OCR_FAILED');
  }
}

function getNativeOcrErrorCode(error: unknown): NativeOcrErrorCode | null {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (typeof code !== 'string') return null;

  const normalized = code.trim().toUpperCase().replace(/^ERR_/, '').replace(/-/g, '_');
  return normalized === 'OCR_IMAGE_UNREADABLE' || normalized === 'OCR_RECOGNITION_FAILED'
    ? normalized
    : null;
}
