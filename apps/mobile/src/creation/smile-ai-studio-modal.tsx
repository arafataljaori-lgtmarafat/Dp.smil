import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface SmileAiStudioModalProps {
  readonly isVisible: boolean;
  readonly onClose: () => void;
  readonly sourceImageUri: string;
  readonly onTriggerAiSimulation: (params: SmileAiParams) => Promise<string | null>;
  readonly onExportVideo: () => void;
}

export interface SmileAiParams {
  readonly shade: string;
  readonly stylePreset: string;
  readonly gumContouringLevel: number;
  readonly translucency: number;
}

const SHADE_OPTIONS = [
  { id: 'BL1', label: 'BL1 Ultra Bleach', color: '#FAFAFA' },
  { id: 'BL2', label: 'BL2 Natural Bleach', color: '#F4F4F0' },
  { id: 'A1', label: 'A1 Bright Natural', color: '#EDEDE0' },
  { id: 'A2', label: 'A2 Warm Natural', color: '#E5E2D0' },
  { id: 'B1', label: 'B1 High Value', color: '#ECECE5' },
];

const STYLE_PRESETS = [
  { id: 'hollywood', name: 'Hollywood Smile', desc: 'Symmetrical, bright, youthful incisal edges' },
  { id: 'natural', name: 'Natural Harmony', desc: 'Subtle characterization with soft rounded corners' },
  { id: 'executive', name: 'Bold Executive', desc: 'Flat incisal plane with dominant central incisors' },
  { id: 'youthful', name: 'Youthful Oval', desc: 'Softer embrasures with pronounced lateral steps' },
];

export const SmileAiStudioModal: React.FC<SmileAiStudioModalProps> = ({
  isVisible,
  onClose,
  sourceImageUri,
  onTriggerAiSimulation,
  onExportVideo,
}) => {
  const [selectedShade, setSelectedShade] = useState('BL2');
  const [selectedPreset, setSelectedPreset] = useState('hollywood');
  const [gumLevel, setGumLevel] = useState(50);
  const [translucency, setTranslucency] = useState(40);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [simulatedResultUri, setSimulatedResultUri] = useState<string | null>(null);

  // Before/After Split Slider position
  const splitPos = useRef(new Animated.Value(SCREEN_WIDTH * 0.5)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(40, Math.min(SCREEN_WIDTH - 40, gestureState.moveX));
        splitPos.setValue(newX);
      },
    })
  ).current;

  if (!isVisible) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationStep(1);

    // Simulate AI generation progress steps
    setTimeout(() => setGenerationStep(2), 1200);
    setTimeout(() => setGenerationStep(3), 2400);

    try {
      const generatedUri = await onTriggerAiSimulation({
        shade: selectedShade,
        stylePreset: selectedPreset,
        gumContouringLevel: gumLevel,
        translucency,
      });
      if (generatedUri) {
        setSimulatedResultUri(generatedUri);
      } else {
        setSimulatedResultUri(sourceImageUri); // Fallback uri for preview
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
      setGenerationStep(0);
    }
  };

  return (
    <View style={styles.overlayContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <MaterialCommunityIcons name="star-four-points-outline" size={24} color="#0EA5E9" />
          <Text style={styles.headerTitle}>Smile AI Studio Pro</Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Feather name="x" size={20} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
        {/* Before / After Dual Viewport Canvas */}
        <View style={styles.viewportContainer}>
          <View style={styles.imageWrapper}>
            <Image source={{ uri: sourceImageUri }} style={styles.viewportImage} resizeMode="cover" />
            
            {simulatedResultUri && (
              <Animated.View style={[styles.simulatedOverlay, { width: splitPos }]}>
                <Image source={{ uri: simulatedResultUri }} style={[styles.viewportImage, { width: SCREEN_WIDTH - 32 }]} resizeMode="cover" />
                <View style={styles.badgeSimulated}>
                  <Text style={styles.badgeText}>AI SIMULATION</Text>
                </View>
              </Animated.View>
            )}

            {/* Split Slider Handle */}
            {simulatedResultUri && (
              <Animated.View
                style={[styles.sliderHandleLine, { transform: [{ translateX: splitPos }] }]}
                {...panResponder.panHandlers}
              >
                <View style={styles.sliderKnob}>
                  <Ionicons name="swap-horizontal" size={16} color="#0EA5E9" />
                </View>
              </Animated.View>
            )}
          </View>
          <View style={styles.viewportFooter}>
            <Text style={styles.viewportHint}>
              {simulatedResultUri ? 'Drag slider to compare Before & After' : 'Original Clinical Photo Loaded'}
            </Text>
          </View>
        </View>

        {/* AI Progress Card */}
        {isGenerating && (
          <View style={styles.aiStatusCard}>
            <View style={styles.aiStatusHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color="#0EA5E9" />
              <Text style={styles.aiStatusTitle}>AI DeepSmile Engine Processing...</Text>
            </View>
            <View style={styles.stepProgressRow}>
              <View style={[styles.stepDot, generationStep >= 1 && styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={[styles.stepDot, generationStep >= 2 && styles.stepDotActive]} />
              <View style={styles.stepLine} />
              <View style={[styles.stepDot, generationStep >= 3 && styles.stepDotActive]} />
            </View>
            <Text style={styles.stepText}>
              {generationStep === 1 && 'Step 1/3: Analyzing 3D Dental Arch Alignment & Gingiva'}
              {generationStep === 2 && 'Step 2/3: Applying Porcelain Translucency & Vita Shade'}
              {generationStep === 3 && 'Step 3/3: Rendering Photorealistic 4K Aesthetic Preview'}
            </Text>
          </View>
        )}

        {/* Control Section: VITA Shade Guide */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>1. Vita Porcelain Shade</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shadeScroll}>
            {SHADE_OPTIONS.map((shade) => (
              <TouchableOpacity
                key={shade.id}
                style={[
                  styles.shadeChip,
                  selectedShade === shade.id && styles.shadeChipSelected,
                ]}
                onPress={() => setSelectedShade(shade.id)}
              >
                <View style={[styles.colorSwatch, { backgroundColor: shade.color }]} />
                <Text style={[styles.shadeLabel, selectedShade === shade.id && styles.shadeLabelSelected]}>
                  {shade.id}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Control Section: Smile Presets */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>2. Aesthetic Smile Architecture</Text>
          <View style={styles.presetGrid}>
            {STYLE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetCard,
                  selectedPreset === preset.id && styles.presetCardSelected,
                ]}
                onPress={() => setSelectedPreset(preset.id)}
              >
                <View style={styles.presetHeaderRow}>
                  <Text style={[styles.presetName, selectedPreset === preset.id && styles.presetNameSelected]}>
                    {preset.name}
                  </Text>
                  {selectedPreset === preset.id && (
                    <Ionicons name="checkmark-circle" size={18} color="#0EA5E9" />
                  )}
                </View>
                <Text style={styles.presetDesc}>{preset.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Control Section: Gingival & Translucency Adjustments */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>3. Micro-Aesthetic Parameters</Text>
          
          <View style={styles.sliderRow}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderName}>Gingival Contouring</Text>
              <Text style={styles.sliderVal}>{gumLevel}%</Text>
            </View>
            <View style={styles.fakeSliderTrack}>
              <View style={[styles.fakeSliderFill, { width: `${gumLevel}%` }]} />
            </View>
          </View>

          <View style={styles.sliderRow}>
            <View style={styles.sliderLabelRow}>
              <Text style={styles.sliderName}>Incisal Translucency</Text>
              <Text style={styles.sliderVal}>{translucency}%</Text>
            </View>
            <View style={styles.fakeSliderTrack}>
              <View style={[styles.fakeSliderFill, { width: `${translucency}%`, backgroundColor: '#10B981' }]} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer Action Buttons */}
      <View style={styles.footerBar}>
        <TouchableOpacity style={styles.videoExportBtn} onPress={onExportVideo}>
          <Ionicons name="videocam-outline" size={20} color="#0EA5E9" />
          <Text style={styles.videoExportBtnText}>Render 4K Video</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.generateBtn, isGenerating && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={isGenerating}
        >
          <MaterialCommunityIcons name="star-four-points-outline" size={20} color="#FFFFFF" />
          <Text style={styles.generateBtnText}>
            {isGenerating ? 'Synthesizing...' : 'Generate AI Simulation'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#1E293B',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  viewportContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  imageWrapper: {
    width: '100%',
    height: 260,
    position: 'relative',
    backgroundColor: '#000000',
  },
  viewportImage: {
    width: '100%',
    height: '100%',
  },
  simulatedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  badgeSimulated: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#0EA5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sliderHandleLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#0EA5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderKnob: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#0EA5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -15,
  },
  viewportFooter: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  viewportHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  aiStatusCard: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0EA5E944',
  },
  aiStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  aiStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0EA5E9',
  },
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  stepDotActive: {
    backgroundColor: '#0EA5E9',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#334155',
  },
  stepText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  sectionCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  shadeScroll: {
    flexDirection: 'row',
  },
  shadeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shadeChipSelected: {
    borderColor: '#0EA5E9',
    backgroundColor: '#0EA5E915',
  },
  colorSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  shadeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  shadeLabelSelected: {
    color: '#0EA5E9',
  },
  presetGrid: {
    gap: 10,
  },
  presetCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetCardSelected: {
    borderColor: '#0EA5E9',
    backgroundColor: '#0EA5E910',
  },
  presetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  presetNameSelected: {
    color: '#0EA5E9',
  },
  presetDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  sliderRow: {
    gap: 6,
  },
  sliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sliderName: {
    fontSize: 13,
    color: '#94A3B8',
  },
  sliderVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  fakeSliderTrack: {
    height: 8,
    backgroundColor: '#1E293B',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fakeSliderFill: {
    height: '100%',
    backgroundColor: '#0EA5E9',
    borderRadius: 4,
  },
  footerBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  videoExportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#0EA5E944',
  },
  videoExportBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0EA5E9',
  },
  generateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
