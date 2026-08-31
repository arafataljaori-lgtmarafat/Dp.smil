import { Platform } from 'react-native';

import { renderAuthoritativeCompositionExport as renderNative } from './authoritative-composition-export.native';
import { renderAuthoritativeCompositionExport as renderWeb } from './authoritative-composition-export.web';

export const renderAuthoritativeCompositionExport = Platform.OS === 'web' ? renderWeb : renderNative;
