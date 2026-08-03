import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

export type ExportOutcome =
  | { ok: true }
  | { ok: false; code: 'CAPTURE_FAILED' | 'SHARING_UNAVAILABLE' | 'SHARE_FAILED' };

type CaptureTarget = Parameters<typeof captureRef>[0];

export function reportExportFailureMessage(outcome: Exclude<ExportOutcome, { ok: true }>) {
  switch (outcome.code) {
    case 'CAPTURE_FAILED':
      return 'Could not prepare the private report image. Please try again.';
    case 'SHARING_UNAVAILABLE':
      return 'Sharing is unavailable on this device. Please try again later.';
    case 'SHARE_FAILED':
      return 'Could not open the share sheet. Please try again.';
  }
}

export type ReportSharingPort = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(uri: string, options: { mimeType: string; UTI: string; dialogTitle: string }): Promise<void>;
  deleteCacheFile(uri: string): Promise<void>;
};

export type DraftShareOutcome =
  | { ok: true }
  | { ok: false; code: 'PREPARE_FAILED' | 'SHARING_UNAVAILABLE' | 'SHARE_FAILED' };

export type DraftSharingPort = {
  isAvailableAsync(): Promise<boolean>;
  createTextCacheFile(text: string): Promise<string>;
  shareAsync(uri: string, options: { mimeType: string; dialogTitle: string }): Promise<void>;
  deleteCacheFile(uri: string): Promise<void>;
};

export const nativeReportSharingPort: ReportSharingPort = {
  isAvailableAsync: Sharing.isAvailableAsync,
  shareAsync: Sharing.shareAsync,
  async deleteCacheFile(uri) {
    new File(uri).delete();
  },
};

export const nativeDraftSharingPort: DraftSharingPort = {
  isAvailableAsync: Sharing.isAvailableAsync,
  async createTextCacheFile(text) {
    const file = new File(Paths.cache, `convoautopsy-response-${Date.now().toString(36)}.txt`);
    file.write(text);
    return file.uri;
  },
  shareAsync: Sharing.shareAsync,
  async deleteCacheFile(uri) {
    new File(uri).delete();
  },
};

const captureOptions = {
  format: 'png' as const,
  height: 1920,
  quality: 1,
  result: 'tmpfile' as const,
  width: 1080,
};

export async function captureAndShareReport(
  ref: CaptureTarget | null,
  sharingPort: ReportSharingPort = nativeReportSharingPort,
): Promise<ExportOutcome> {
  if (!ref) return { ok: false, code: 'CAPTURE_FAILED' };

  try {
    if (!(await sharingPort.isAvailableAsync())) return { ok: false, code: 'SHARING_UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'SHARING_UNAVAILABLE' };
  }

  let temporaryUri: string | null = null;
  try {
    try {
      temporaryUri = await captureRef(ref, captureOptions);
    } catch {
      return { ok: false, code: 'CAPTURE_FAILED' };
    }

    try {
      await sharingPort.shareAsync(temporaryUri, {
        dialogTitle: 'Share private report image',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
      return { ok: true };
    } catch {
      return { ok: false, code: 'SHARE_FAILED' };
    }
  } finally {
    if (temporaryUri) {
      try {
        await sharingPort.deleteCacheFile(temporaryUri);
      } catch {
        // The share result is still accurate even if cache cleanup is unavailable.
      }
    }
  }
}

export async function shareDraftText(
  text: string,
  sharingPort: DraftSharingPort = nativeDraftSharingPort,
): Promise<DraftShareOutcome> {
  try {
    if (!(await sharingPort.isAvailableAsync())) return { ok: false, code: 'SHARING_UNAVAILABLE' };
  } catch {
    return { ok: false, code: 'SHARING_UNAVAILABLE' };
  }

  let temporaryUri: string | null = null;
  try {
    try {
      temporaryUri = await sharingPort.createTextCacheFile(text);
    } catch {
      return { ok: false, code: 'PREPARE_FAILED' };
    }

    try {
      await sharingPort.shareAsync(temporaryUri, {
        dialogTitle: 'Share response draft',
        mimeType: 'text/plain',
      });
      return { ok: true };
    } catch {
      return { ok: false, code: 'SHARE_FAILED' };
    }
  } finally {
    if (temporaryUri) {
      try {
        await sharingPort.deleteCacheFile(temporaryUri);
      } catch {
        // Cleanup is best-effort and must not change the user-visible share result.
      }
    }
  }
}
