import { Platform } from 'react-native';

import { renderCompositionOffscreen as renderNative } from './composition-offscreen-export.native';
import { renderCompositionOffscreen as renderWeb } from './composition-offscreen-export.web';

export const renderCompositionOffscreen = Platform.OS === 'web' ? renderWeb : renderNative;
