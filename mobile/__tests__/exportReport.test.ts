import { captureRef } from 'react-native-view-shot';
import {
  captureAndShareReport,
  shareDraftText,
  type DraftSharingPort,
  type ReportSharingPort,
} from '../src/services/exportReport';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const mockedCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;

function createSharingPort(overrides: Partial<ReportSharingPort> = {}): jest.Mocked<ReportSharingPort> {
  const port = {
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
    deleteCacheFile: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<ReportSharingPort>;
  Object.assign(port, overrides);
  return port;
}

function createDraftSharingPort(overrides: Partial<DraftSharingPort> = {}): jest.Mocked<DraftSharingPort> {
  const port = {
    createTextCacheFile: jest.fn().mockResolvedValue('file:///cache/private-draft.txt'),
    deleteCacheFile: jest.fn().mockResolvedValue(undefined),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<DraftSharingPort>;
  Object.assign(port, overrides);
  return port;
}

describe('captureAndShareReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCaptureRef.mockResolvedValue('file:///cache/private-report.png');
  });

  it('reports only that the share sheet opened and cleans up the temporary image', async () => {
    const sharing = createSharingPort();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: true });

    expect(mockedCaptureRef).toHaveBeenCalledWith(expect.anything(), {
      format: 'png',
      height: 1920,
      quality: 1,
      result: 'tmpfile',
      width: 1080,
    });
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/private-report.png', {
      dialogTitle: 'Share private report image',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(sharing.deleteCacheFile).toHaveBeenCalledWith('file:///cache/private-report.png');
  });

  it('returns a capture failure without exposing capture error contents', async () => {
    const sharing = createSharingPort();
    const secret = 'Ava said a private thing';
    mockedCaptureRef.mockRejectedValueOnce(new Error(secret));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'CAPTURE_FAILED' });

    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(sharing.deleteCacheFile).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(secret));
    errorSpy.mockRestore();
  });

  it('returns an unavailable outcome before capturing a report image', async () => {
    const sharing = createSharingPort({ isAvailableAsync: jest.fn().mockResolvedValue(false) });

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'SHARING_UNAVAILABLE' });

    expect(mockedCaptureRef).not.toHaveBeenCalled();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(sharing.deleteCacheFile).not.toHaveBeenCalled();
  });

  it('returns a share failure without exposing share error contents and still deletes the temporary image', async () => {
    const secret = 'Person A: unsaved source text';
    const sharing = createSharingPort({ shareAsync: jest.fn().mockRejectedValue(new Error(secret)) });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'SHARE_FAILED' });

    expect(sharing.deleteCacheFile).toHaveBeenCalledWith('file:///cache/private-report.png');
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(secret));
    errorSpy.mockRestore();
  });
});

describe('shareDraftText', () => {
  it('uses a temporary cache file, reports a sheet opening, and cleans up in all share outcomes', async () => {
    const sharing = createDraftSharingPort();

    await expect(shareDraftText('Private reply text', sharing)).resolves.toEqual({ ok: true });

    expect(sharing.createTextCacheFile).toHaveBeenCalledWith('Private reply text');
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/private-draft.txt', {
      dialogTitle: 'Share response draft',
      mimeType: 'text/plain',
    });
    expect(sharing.deleteCacheFile).toHaveBeenCalledWith('file:///cache/private-draft.txt');
  });

  it('does not expose draft contents when native sharing fails', async () => {
    const secret = 'Private reply text that must not be logged';
    const sharing = createDraftSharingPort({ shareAsync: jest.fn().mockRejectedValue(new Error(secret)) });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(shareDraftText(secret, sharing)).resolves.toEqual({ ok: false, code: 'SHARE_FAILED' });

    expect(sharing.deleteCacheFile).toHaveBeenCalledWith('file:///cache/private-draft.txt');
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(secret));
    errorSpy.mockRestore();
  });
});
