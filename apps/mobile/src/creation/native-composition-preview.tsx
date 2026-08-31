import { Platform } from 'react-native';

import { NativeCompositionPreview as NativeSkiaCompositionPreview } from './native-composition-preview.native';
import { NativeCompositionPreview as WebCompositionPreview } from './native-composition-preview.web';

// Web renders the explicit non-editing fallback. Skia is mounted only by the Android/iOS branch.
export const NativeCompositionPreview = Platform.OS === 'web' ? WebCompositionPreview : NativeSkiaCompositionPreview;
