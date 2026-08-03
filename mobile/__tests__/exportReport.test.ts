import { captureRef } from 'react-native-view-shot';
import {
  captureAndShareReport,
  shareDraftText,
  type DraftSharingPort,
  type ReportSharingPort,
} from '../src/services/exportReport';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));

const mockedCaptureRef = captureRef as jest.MockedFunction<typeof captureRef>;

function createSharingPort(overrides: Partial<ReportSharingPort> = {}): jest.Mocked<ReportSharingPort> {
  const port = {
    getPixelRatio: jest.fn().mockReturnValue(3),
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    releaseCapture: jest.fn(),
    shareAsync: jest.fn().mockResolvedValue(undefined),
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
    mockedCaptureRef.mockResolvedValue('/cache/private-report.png');
  });

  it('normalizes a raw iOS capture path for sharing while releasing its original handle', async () => {
    const sharing = createSharingPort();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: true });

    expect(mockedCaptureRef).toHaveBeenCalledWith(expect.anything(), {
      format: 'png',
      height: 640,
      quality: 1,
      result: 'tmpfile',
      width: 360,
    });
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/private-report.png', {
      dialogTitle: 'Share private report image',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(sharing.releaseCapture).toHaveBeenCalledWith('/cache/private-report.png');
  });

  it.each([2, 3])('uses %i-scale point dimensions that target a 1080 by 1920 pixel image', async (scale) => {
    const sharing = createSharingPort({ getPixelRatio: jest.fn().mockReturnValue(scale) });

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: true });

    const [, options] = mockedCaptureRef.mock.calls[0];
    expect(options?.width).toBe(1080 / scale);
    expect(options?.height).toBe(1920 / scale);
    expect((options?.width ?? 0) * scale).toBe(1080);
    expect((options?.height ?? 0) * scale).toBe(1920);
  });

  it('preserves an already-normalized capture URL for sharing and cleanup', async () => {
    const sharing = createSharingPort();
    mockedCaptureRef.mockResolvedValueOnce('file:///cache/private-report.png');

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: true });

    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///cache/private-report.png', expect.anything());
    expect(sharing.releaseCapture).toHaveBeenCalledWith('file:///cache/private-report.png');
  });

  it('returns a capture failure without exposing capture error contents', async () => {
    const sharing = createSharingPort();
    const secret = 'Ava said a private thing';
    mockedCaptureRef.mockRejectedValueOnce(new Error(secret));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'CAPTURE_FAILED' });

    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(sharing.releaseCapture).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining(secret));
    errorSpy.mockRestore();
  });

  it('returns an unavailable outcome before capturing a report image', async () => {
    const sharing = createSharingPort({ isAvailableAsync: jest.fn().mockResolvedValue(false) });

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'SHARING_UNAVAILABLE' });

    expect(mockedCaptureRef).not.toHaveBeenCalled();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(sharing.releaseCapture).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('fails safely without capturing on an invalid pixel ratio (%s)', async (scale) => {
    const sharing = createSharingPort({ getPixelRatio: jest.fn().mockReturnValue(scale) });

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'CAPTURE_FAILED' });

    expect(mockedCaptureRef).not.toHaveBeenCalled();
    expect(sharing.shareAsync).not.toHaveBeenCalled();
    expect(sharing.releaseCapture).not.toHaveBeenCalled();
  });

  it('returns a share failure without exposing share error contents and still deletes the temporary image', async () => {
    const secret = 'Person A: unsaved source text';
    const sharing = createSharingPort({ shareAsync: jest.fn().mockRejectedValue(new Error(secret)) });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await expect(captureAndShareReport({} as never, sharing)).resolves.toEqual({ ok: false, code: 'SHARE_FAILED' });

    expect(sharing.releaseCapture).toHaveBeenCalledWith('/cache/private-report.png');
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
