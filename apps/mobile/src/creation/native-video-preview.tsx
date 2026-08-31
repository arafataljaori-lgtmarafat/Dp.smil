import { Platform } from 'react-native';

import { NativeVideoPreview as NativeSkiaVideoPreview } from './native-video-preview.native';
import { NativeVideoPreview as WebVideoPreview } from './native-video-preview.web';

export const NativeVideoPreview = Platform.OS === 'web' ? WebVideoPreview : NativeSkiaVideoPreview;
export type { NativeVideoPreviewProps } from './native-video-preview.native';
