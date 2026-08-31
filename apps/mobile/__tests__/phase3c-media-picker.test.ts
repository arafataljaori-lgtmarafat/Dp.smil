jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'Current' },
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

import * as ImagePicker from 'expo-image-picker';
import { chooseFromLibrary, createPendingPickerResultRecovery, resultToPickerOutcome, takePhoto } from '../src/media/media-picker';

const selected = (mimeType?: string) => ({ canceled: false, assets: [{ uri: 'file:///patient.png', fileName: 'patient.png', mimeType, fileSize: 12, width: 1, height: 1 }] });

describe('Phase 3C media picker boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns idle-compatible cancellation from photo library', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: true, assets: null } as never);
    await expect(chooseFromLibrary()).resolves.toEqual({ kind: 'cancelled' });
  });

  it('does not rewrite unknown picker MIME metadata to image/jpeg', () => {
    expect(resultToPickerOutcome(selected(undefined) as never)).toEqual({ kind: 'selected', asset: { uri: 'file:///patient.png', fileName: 'patient.png', fileSize: 12, width: 1, height: 1 } });
  });

  it.each(['image/heic', 'image/heif', 'image/avif'])('reports identifiable unsupported source %s before upload', (mimeType) => {
    expect(resultToPickerOutcome(selected(mimeType) as never)).toEqual({ kind: 'unsupported-format', mimeType });
  });

  it('returns safe camera permission-denied state without launching camera', async () => {
    jest.mocked(ImagePicker.getCameraPermissionsAsync).mockResolvedValue({ granted: false, canAskAgain: false } as never);
    await expect(takePhoto()).resolves.toEqual({ kind: 'permission-denied', canAskAgain: false });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('recovers the Android pending picker result once only', async () => {
    jest.mocked(ImagePicker.getPendingResultAsync).mockResolvedValue(selected('image/png') as never);
    const recover = createPendingPickerResultRecovery();
    await expect(recover()).resolves.toMatchObject({ kind: 'selected', asset: { uri: 'file:///patient.png', mimeType: 'image/png' } });
    await expect(recover()).resolves.toBeNull();
    expect(ImagePicker.getPendingResultAsync).toHaveBeenCalledTimes(1);
  });
});
