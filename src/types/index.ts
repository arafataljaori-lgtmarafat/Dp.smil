export type AspectRatioType = "9:16" | "4:5" | "1:1" | "16:9";

export type TemplateId =
  | "cinematic-reveal"
  | "luxury-veneers"
  | "split-compare"
  | "vertical-curtain"
  | "clinical-clean"
  | "spotlight-smile"
  | "dynamic-zoom"
  | "social-reel"
  | "minimal-white"
  | "premium-dark"
  | "split-slider"
  | "spotlight-zoom"
  | "glow-morph"
  | "dual-side-by-side"
  | "social-story-reel"
  | "pulse-reveal"
  | "curtain-wipe"
  | "diagonal-sweep";

export type TransitionType =
  | "wipe-right"
  | "wipe-left"
  | "curtain-vertical"
  | "curtain-horizontal"
  | "spotlight"
  | "crossfade"
  | "split-sweep"
  | "soft-blur"
  | "specular-flash"
  | "diagonal-slice";

export type ZoomEffectType =
  | "zoom-in"
  | "zoom-out"
  | "ken-burns"
  | "pan-left-to-right"
  | "pan-right-to-left"
  | "subtle-breathe"
  | "parallax-shift"
  | "static";

export type BadgeStyleType =
  | "minimal-pill"
  | "gold-luxury"
  | "clinical-teal"
  | "neon-cyber"
  | "glass-frost"
  | "royal-navy";

export type WatermarkPositionType =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center";

export type AudioTrackId =
  | "ambient-clean"
  | "luxury-aesthetics"
  | "modern-health"
  | "gentle-acoustic"
  | "lounge-pulse"
  | "custom"
  | "none";

export interface PhotoAlignment {
  scale: number;
  rotation: number; // in degrees
  offsetX: number; // in pixels
  offsetY: number; // in pixels
  flipH: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
}

export interface CasePhoto {
  id: string;
  role: "before" | "after" | "during" | "retracted" | "profile";
  url: string;
  label: string;
  takenAt?: string;
  alignment: PhotoAlignment;
}

export interface BrandingConfig {
  clinicName: string;
  doctorName: string;
  tagline: string;
  logoUrl: string | null;
  watermarkPosition: WatermarkPositionType;
  watermarkOpacity: number;
  badgeStyle: BadgeStyleType;
  showShadeComparison: boolean;
  showTreatmentBadge: boolean;
  showDoctorName: boolean;
  showClinicLogo: boolean;
  showAnimatedProgressBar: boolean;
  customFooter: string;
  accentColor: string;
}

export interface AudioConfig {
  trackId: AudioTrackId;
  volume: number; // 0 to 1
  customAudioUrl?: string;
  customAudioName?: string;
  enableBeats: boolean;
}

export interface TextOverlayItem {
  id: string;
  text: string;
  timeStart: number;
  timeEnd: number;
  position: "top" | "middle" | "bottom" | "custom";
  customX?: number;
  customY?: number;
  style: "badge" | "subtitle" | "stamp" | "highlight";
}

export interface VideoProjectConfig {
  templateId: TemplateId;
  aspectRatio: AspectRatioType;
  duration: number; // in seconds (e.g. 5, 8, 10)
  fps: number; // 30 or 60
  transitionDuration: number; // e.g. 1.5s
  transitionType: TransitionType;
  zoomEffect: ZoomEffectType;
  zoomIntensity: number; // 1.05 to 1.35
  branding: BrandingConfig;
  audio: AudioConfig;
  textOverlays: TextOverlayItem[];
  enableSparkles: boolean;
  enableMotionBlur: boolean;
  enableScanlineEffect: boolean;
}

export interface CaseVersion {
  id: string;
  timestamp: string;
  note: string;
  author: string;
  configSnapshot: VideoProjectConfig;
}

export interface PatientCase {
  id: string;
  patientCode: string;
  patientName: string;
  age?: number;
  gender?: "male" | "female" | "other";
  treatmentType: string;
  procedureDate: string;
  shadeBefore: string;
  shadeAfter: string;
  doctorName: string;
  clinicName: string;
  notes: string;
  tags: string[];
  photos: CasePhoto[];
  videoConfig: VideoProjectConfig;
  versions: CaseVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface ClinicProfile {
  id: string;
  clinicName: string;
  doctorName: string;
  specialty: string;
  phone: string;
  instagram?: string;
  instagramHandle?: string;
  tiktok?: string;
  logoUrl: string | null;
  defaultAccentColor?: string;
  themeColor?: string;
  defaultBadgeStyle?: BadgeStyleType;
}

export interface DimensionConfig {
  width: number;
  height: number;
  label: string;
  iconName: string;
  recommendedFor: string;
}
