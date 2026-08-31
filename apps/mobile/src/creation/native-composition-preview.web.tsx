import { Text, View } from 'react-native';

import type { NativeCompositionPreviewProps } from './native-composition-preview.types';

/**
 * Web is intentionally a safe non-editing fallback in Phase 4B. Native Android/iOS use Skia;
 * this component avoids requiring CanvasKit initialization in the existing web preview.
 */
export function NativeCompositionPreview({ plan, width, height, accessibilityLabel = 'Dental composition preview unavailable on web' }: NativeCompositionPreviewProps): React.JSX.Element {
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ width, height, borderRadius: 12, backgroundColor: '#F2F4F5', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ color: '#172229', fontWeight: '600', textAlign: 'center' }}>Native composition preview</Text>
      <Text style={{ color: '#61717A', marginTop: 6, textAlign: 'center' }}>{plan.template.id} v{plan.template.version} is available in the Android and iOS app.</Text>
    </View>
  );
}
