import * as ImagePicker from 'expo-image-picker';

import type { NormalizedMediaAsset } from './media-upload-state';

export type PickerOutcome =
  | { readonly kind: 'selected'; readonly asset: NormalizedMediaAsset }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'permission-denied'; readonly canAskAgain: boolean }
  | { readonly kind: 'unsupported-format'; readonly mimeType?: string };

const unsupportedMimeTypes = new Set(['image/heic', 'image/heif', 'image/avif']);
const pickerOptions = {
  mediaTypes: ['images'] as ImagePicker.MediaType[],
  allowsEditing: false,
  quality: 1,
  base64: false,
  exif: false,
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
};

export function normalizePickerAsset(asset: ImagePicker.ImagePickerAsset): NormalizedMediaAsset {
  return {
    uri: asset.uri,
    ...(asset.fileName ? { fileName: asset.fileName } : {}),
    ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
    ...(asset.fileSize === null || asset.fileSize === undefined ? {} : { fileSize: asset.fileSize }),
    ...(asset.width ? { width: asset.width } : {}),
    ...(asset.height ? { height: asset.height } : {}),
    ...(asset.file ? { webFile: asset.file } : {}),
  };
}

export function resultToPickerOutcome(result: ImagePicker.ImagePickerResult): PickerOutcome {
  if (result.canceled || result.assets[0] === undefined) return { kind: 'cancelled' };
  const asset = result.assets[0];
  const mimeType = asset.mimeType;
  if (mimeType !== null && mimeType !== undefined && unsupportedMimeTypes.has(mimeType.toLowerCase())) {
    return { kind: 'unsupported-format', mimeType };
  }
  return { kind: 'selected', asset: normalizePickerAsset(asset) };
}

export async function chooseFromLibrary(): Promise<PickerOutcome> {
  return resultToPickerOutcome(await ImagePicker.launchImageLibraryAsync(pickerOptions));
}

export async function takePhoto(): Promise<PickerOutcome> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return resultToPickerOutcome(await ImagePicker.launchCameraAsync(pickerOptions));
  if (!current.canAskAgain) return { kind: 'permission-denied', canAskAgain: false };
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { kind: 'permission-denied', canAskAgain: permission.canAskAgain };
  return resultToPickerOutcome(await ImagePicker.launchCameraAsync(pickerOptions));
}

export function createPendingPickerResultRecovery() {
  let consumed = false;
  return async (): Promise<PickerOutcome | null> => {
    if (consumed) return null;
    consumed = true;
    const pending = await ImagePicker.getPendingResultAsync();
    if (pending === null) return null;
    if (!('canceled' in pending)) return { kind: 'cancelled' };
    return resultToPickerOutcome(pending);
  };
}
