import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Download,
  Sliders,
  Maximize2,
  Camera,
  Smartphone,
  Square,
  Grid,
  Monitor,
  Music,
  Type,
  Palette,
  ShieldCheck,
  Zap,
  Repeat,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Layers,
  ArrowRight,
  Clock,
  Sparkle,
  Eye,
  EyeOff,
  Film,
  Wand2,
} from "lucide-react";
import {
  AspectRatioType,
  AudioTrackId,
  CasePhoto,
  PatientCase,
  PhotoAlignment,
  TemplateId,
  VideoProjectConfig,
  ZoomEffectType,
} from "../types";
import { DentalVideoEngine, ASPECT_RATIOS } from "../services/videoEngine";
import { audioEngine } from "../services/audioEngine";

interface VideoStudioProps {
  patientCase: PatientCase;
  onUpdateCaseConfig: (newConfig: VideoProjectConfig, note?: string) => void;
  onOpenAlignmentStudio: () => void;
  onOpenExportModal: () => void;
  onOpenSmileAI: () => void;
  onBackToCases: () => void;
}

const TEMPLATES: Array<{
  id: TemplateId;
  name: string;
  nameEn: string;
  desc: string;
  badge: string;
  iconName: string;
  category: "luxury" | "clinical" | "social" | "classic";
}> = [
  {
    id: "cinematic-reveal",
    name: "الستار السينمائي (Cinematic Reveal)",
    nameEn: "Cinematic Reveal",
    desc: "مسح ناعم بخط ليزر متوهج وزووم تدريجي على القواطع الأمامية",
    badge: "الأكثر طلباً",
    iconName: "Sparkles",
    category: "luxury",
  },
  {
    id: "luxury-veneers",
    name: "فينيرز الفخامة (Luxury Veneers)",
    nameEn: "Luxury Veneers",
    desc: "لمعان ذهبي شامبين وانتقال رقيق يبرز حواف وشفافية عدسات البورسلين",
    badge: "VIP Luxury",
    iconName: "Sparkle",
    category: "luxury",
  },
  {
    id: "split-compare",
    name: "مسطرة المقارنة (Split Compare)",
    nameEn: "Split Compare",
    desc: "خط فاصل متحرك بمقبض ألماسي يقارن بين قبل وبعد بتناغم تام",
    badge: "تفاعلي",
    iconName: "Sliders",
    category: "clinical",
  },
  {
    id: "vertical-curtain",
    name: "الستار العمودي (Vertical Curtain)",
    nameEn: "Vertical Curtain",
    desc: "كشف عمودي من خط اللثة وصولاً إلى حواف الإطباق لإبراز قوس الابتسامة",
    badge: "قوس الابتسامة",
    iconName: "Layers",
    category: "clinical",
  },
  {
    id: "clinical-clean",
    name: "المعاينة السريرية (Clinical Clean)",
    nameEn: "Clinical Clean",
    desc: "إطار مخبري طبي عالي الدقة مع تدرج لوني ومحاذاة خط الوسط",
    badge: "دقة طبية",
    iconName: "ShieldCheck",
    category: "clinical",
  },
  {
    id: "spotlight-smile",
    name: "العدسة الميكروسكوبية (Spotlight Smile)",
    nameEn: "Spotlight Smile",
    desc: "تكبير دائري على تفاصيل حواف الفينيرز واللثة ثم انفتاح للابتسامة كاملة",
    badge: "ماكرو كلينيكال",
    iconName: "Maximize2",
    category: "clinical",
  },
  {
    id: "dynamic-zoom",
    name: "الزووم الحركي (Dynamic Ken Burns)",
    nameEn: "Dynamic Zoom",
    desc: "حركة كاميرا سينمائية انسيابية تستكشف تدرج ابتسامة المريض من الأنياب إلى السناتر",
    badge: "سينمائي",
    iconName: "Zap",
    category: "luxury",
  },
  {
    id: "social-reel",
    name: "ريلز وتيك توك (Social Reel)",
    nameEn: "Social Story Reel",
    desc: "إيقاع سريع مع شريط تقدم علوي وطابع مخصص لقصص إنستغرام وتيك توك",
    badge: "Viral Reel",
    iconName: "Smartphone",
    category: "social",
  },
  {
    id: "minimal-white",
    name: "مينيمل أبيض ناصع (Minimal White)",
    nameEn: "Minimal White",
    desc: "خلفية بيضاء نقية مع هوامش استوديو ناعمة تبرز نضارة البياض",
    badge: "Modern Minimal",
    iconName: "Square",
    category: "classic",
  },
  {
    id: "premium-dark",
    name: "النمط الملكي الداكن (Premium Dark)",
    nameEn: "Premium Dark",
    desc: "خلفية أوبسيديان فخمة مع كونتراست عالي يظهر نقاء بياض الأسنان ولمعانها",
    badge: "Royal Dark",
    iconName: "Monitor",
    category: "luxury",
  },
  {
    id: "glow-morph",
    name: "التحول البراق (Glow Morph)",
    nameEn: "Glow Morph",
    desc: "تلاشي ناعم مع لمعان بريق المينا ونجوم الانعكاس الضوئي",
    badge: "تجميلي فائق",
    iconName: "Sparkles",
    category: "luxury",
  },
  {
    id: "dual-side-by-side",
    name: "العرض المزدوج (Side-by-Side)",
    nameEn: "Side-by-Side Dual",
    desc: "عرض الصورتين جنباً إلى جنب مع تكبير متزامن وتفاصيل الحالة",
    badge: "مقارنة مباشرة",
    iconName: "Grid",
    category: "clinical",
  },
];

const AUDIO_TRACKS: Array<{ id: AudioTrackId; name: string; mood: string }> = [
  { id: "luxury-aesthetics", name: "Luxury Aesthetic Clinic", mood: "بيانو وتشيللو راقٍ لعيادات التجميل الفاخرة" },
  { id: "ambient-clean", name: "Clean Spa Dental", mood: "نغمات هادئة تبعث على الراحة والاطمئنان" },
  { id: "modern-health", name: "Modern Health Tech", mood: "إيقاع حيوي عصري ومتفائل للسوشيال ميديا" },
  { id: "gentle-acoustic", name: "Gentle Acoustic Warmth", mood: "جيتار دافئ يناسب القصص الإنسانية" },
  { id: "lounge-pulse", name: "Lounge Deep Pulse", mood: "إيقاع لاونج جذاب لمقاطع ريلز السريعة" },
  { id: "custom", name: "رفع مقطع صوتي خاص", mood: "ملف MP3 / WAV من جهازك" },
  { id: "none", name: "بدون صوت (صامت)", mood: "تصدير الفيديو بدون أي مسار صوتي" },
];

const COLOR_PALETTES = [
  { name: "Teal Medical", color: "#14b8a6" },
  { name: "Cyan Cyber", color: "#0ea5e9" },
  { name: "Emerald Bio", color: "#10b981" },
  { name: "Gold Luxury", color: "#f59e0b" },
  { name: "Rose Aesthetic", color: "#f43f5e" },
  { name: "Violet Royal", color: "#8b5cf6" },
];

export const VideoStudio: React.FC<VideoStudioProps> = ({
  patientCase,
  onUpdateCaseConfig,
  onOpenAlignmentStudio,
  onOpenExportModal,
  onOpenSmileAI,
  onBackToCases,
}) => {
  const [config, setConfig] = useState<VideoProjectConfig>(patientCase.videoConfig);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Active settings tab on right side
  const [activeTab, setActiveTab] = useState<"template" | "motion" | "branding" | "audio" | "text">("template");
  const [templateCategory, setTemplateCategory] = useState<"all" | "luxury" | "clinical" | "social" | "classic">("all");
  const [isPeekingBefore, setIsPeekingBefore] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const customAudioInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Loaded image elements
  const [loadedImages, setLoadedImages] = useState<{
    beforeImg: HTMLImageElement | null;
    afterImg: HTMLImageElement | null;
    logoImg: HTMLImageElement | null;
  }>({ beforeImg: null, afterImg: null, logoImg: null });

  const beforePhoto = patientCase.photos.find((p) => p.role === "before") || null;
  const afterPhoto = patientCase.photos.find((p) => p.role === "after") || null;

  // Sync config when patientCase changes
  useEffect(() => {
    setConfig(patientCase.videoConfig);
  }, [patientCase]);

  // Load photos into HTMLImageElements
  useEffect(() => {
    let isCancelled = false;

    const loadAll = async () => {
      let bImg: HTMLImageElement | null = null;
      let aImg: HTMLImageElement | null = null;
      let lImg: HTMLImageElement | null = null;

      if (beforePhoto?.url) {
        try {
          bImg = await DentalVideoEngine.loadImage(beforePhoto.url);
        } catch (e) {
          console.warn("Could not load before img", e);
        }
      }
      if (afterPhoto?.url) {
        try {
          aImg = await DentalVideoEngine.loadImage(afterPhoto.url);
        } catch (e) {
          console.warn("Could not load after img", e);
        }
      }
      if (config.branding.logoUrl) {
        try {
          lImg = await DentalVideoEngine.loadImage(config.branding.logoUrl);
        } catch (e) {
          console.warn("Could not load logo img", e);
        }
      }

      if (!isCancelled) {
        setLoadedImages({ beforeImg: bImg, afterImg: aImg, logoImg: lImg });
      }
    };

    loadAll();
    return () => {
      isCancelled = true;
    };
  }, [beforePhoto?.url, afterPhoto?.url, config.branding.logoUrl]);

  // Update Case Config helper
  const updateConfig = (newCfg: VideoProjectConfig, note?: string) => {
    setConfig(newCfg);
    onUpdateCaseConfig(newCfg, note);
  };

  // Render current frame onto the canvas
  const drawFrame = useCallback(
    (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dim = ASPECT_RATIOS[config.aspectRatio];
      canvas.width = dim.width;
      canvas.height = dim.height;

      const beforeAlign: PhotoAlignment =
        beforePhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };
      const afterAlign: PhotoAlignment =
        afterPhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };

      // If user is peeking before, render t=0 (pure before photo)
      const renderTime = isPeekingBefore ? 0 : t;

      DentalVideoEngine.renderFrame(
        ctx,
        dim.width,
        dim.height,
        renderTime,
        config,
        loadedImages,
        beforeAlign,
        afterAlign
      );
    },
    [config, loadedImages, beforePhoto?.alignment, afterPhoto?.alignment, isPeekingBefore]
  );

  // Play / Pause Animation Loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      audioEngine.stop();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      drawFrame(currentTime);
      return;
    }

    // Start Audio
    if (!isMuted) {
      audioEngine.start(config.audio, config.duration, currentTime);
    }

    const step = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const delta = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setCurrentTime((prevTime) => {
        let nextTime = prevTime + delta * playbackSpeed;
        if (nextTime >= config.duration) {
          if (isLooping) {
            nextTime = 0;
            if (!isMuted) {
              audioEngine.start(config.audio, config.duration, 0);
            }
          } else {
            setIsPlaying(false);
            return config.duration;
          }
        }
        drawFrame(nextTime);
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, playbackSpeed, isLooping, isMuted, config, drawFrame]);

  // Scrub handler
  const handleScrub = (t: number) => {
    setCurrentTime(t);
    drawFrame(t);
    if (isPlaying && !isMuted) {
      audioEngine.start(config.audio, config.duration, t);
    }
  };

  // Toggle Play / Pause
  const togglePlay = () => {
    if (currentTime >= config.duration) {
      setCurrentTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  // Snapshot frame capture
  const handleTakeSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `DentPilot-${patientCase.patientCode}-Snapshot.png`;
    link.href = url;
    link.click();
  };

  // Custom Audio Upload Handler
  const handleCustomAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const audioUrl = URL.createObjectURL(file);
    updateConfig({
      ...config,
      audio: {
        ...config.audio,
        trackId: "custom",
        customAudioUrl: audioUrl,
        customAudioName: file.name,
      },
    });
  };

  // Clinic Logo Upload Handler
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      updateConfig({
        ...config,
        branding: {
          ...config.branding,
          logoUrl: base64,
          showClinicLogo: true,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  // Aspect ratio helper
  const dim = ASPECT_RATIOS[config.aspectRatio];

  return (
    <div className="flex flex-col h-[100dvh] lg:h-auto lg:max-w-7xl mx-auto lg:px-8 lg:py-6 lg:space-y-6 bg-slate-950 lg:bg-transparent overflow-hidden lg:overflow-visible animate-in fade-in slide-in-from-bottom-4 duration-300">

      {/* Mobile-friendly workflow stepper (Hidden on mobile editor to save space) */}
      <div className="hidden lg:flex items-center justify-start gap-2 px-2 py-3 bg-slate-900/50 rounded-2xl border border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-none shadow-sm mb-2">
        <div className="flex items-center text-xs font-bold text-teal-400">
          <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center ml-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </span>
          الصور المرفوعة
        </div>
        <ChevronLeft className="w-4 h-4 text-slate-700" />
        <div
          className="flex items-center text-xs font-bold text-slate-300 cursor-pointer hover:text-teal-400 transition-colors"
          onClick={onOpenAlignmentStudio}
        >
          <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center ml-1.5">2</span>
          محاذاة تشريحية
        </div>
        <ChevronLeft className="w-4 h-4 text-slate-700" />
        <div className="flex items-center text-xs font-bold text-teal-950 bg-teal-500 px-3 py-1 rounded-full shadow-md shadow-teal-500/20">
          <span className="w-5 h-5 rounded-full bg-teal-950/20 flex items-center justify-center ml-1.5 text-teal-950">3</span>
          الاستوديو التجميلي
        </div>
        <ChevronLeft className="w-4 h-4 text-slate-700" />
        <div
          className="flex items-center text-xs font-bold text-slate-500 cursor-pointer hover:text-cyan-400 transition-colors"
          onClick={onOpenExportModal}
        >
          <span className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center ml-1.5 text-slate-500">4</span>
          تصدير الفيديو
        </div>
      </div>

      {/* Top Studio Bar (Sticky on mobile) */}
      <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 bg-slate-900/90 lg:bg-slate-900/80 backdrop-blur-md px-3 py-2 sm:p-4 lg:rounded-2xl border-b lg:border border-slate-800 shadow-sm shrink-0 z-20">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            id="btn-back-to-cases"
            onClick={onBackToCases}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="الرجوع لقائمة الحالات"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-white truncate max-w-[120px] sm:max-w-[200px]">
                {patientCase.patientName}
              </h1>
              <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono hidden sm:inline-block">
                {patientCase.patientCode}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[120px] sm:max-w-none">{patientCase.treatmentType}</p>
          </div>
        </div>

        {/* Aspect Ratio Switcher Pills */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg sm:rounded-xl border border-slate-800 overflow-x-auto scrollbar-none flex-1 lg:flex-none justify-center">
          {(["9:16", "4:5", "1:1", "16:9"] as AspectRatioType[]).map((ar) => (
            <button
              key={ar}
              id={`ar-btn-${ar.replace(":", "-")}`}
              onClick={() => updateConfig({ ...config, aspectRatio: ar })}
              className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition-all shrink-0 ${
                config.aspectRatio === ar
                  ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              {ar === "9:16" && <Smartphone className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {ar === "4:5" && <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {ar === "1:1" && <Grid className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {ar === "16:9" && <Monitor className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              <span className="hidden sm:inline">{ar}</span>
            </button>
          ))}
        </div>

        {/* Studio Action Shortcuts (Desktop only, mobile has bottom bar) */}
        <div className="hidden lg:flex items-center gap-2">
          <button
            id="btn-open-aligner"
            onClick={onOpenAlignmentStudio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors"
          >
            <Sliders className="w-4 h-4 text-teal-400" />
            <span>محاذاة الصور</span>
          </button>

          <button
            id="btn-open-export"
            onClick={onOpenExportModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>تصدير الفيديو (MP4)</span>
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Video Player on Left (Top on Mobile), Control Tabs on Right (Bottom on Mobile) */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-0 lg:gap-6 min-h-0 pb-[60px] lg:pb-0">

        {/* Top/Left Side: Video Canvas Player & Scrub Controls */}
        <div className="lg:col-span-7 bg-slate-950 lg:bg-slate-900 border-b border-slate-900 lg:border lg:border-slate-800 lg:rounded-2xl p-2 sm:p-4 lg:p-5 flex flex-col items-center gap-2 sm:gap-4 shadow-xl z-10 shrink-0">

          {/* Canvas Wrapper */}
          <div
            className="relative bg-slate-900 rounded-lg sm:rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center w-full max-w-[480px] lg:max-w-[560px]"
            style={{
              aspectRatio: `${dim.width} / ${dim.height}`,
            }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain select-none"
              onClick={togglePlay}
            />

            {/* Central Play/Pause Watermark Overlay on Hover */}
            <div
              onClick={togglePlay}
              className="absolute inset-0 bg-black/10 hover:bg-black/25 flex items-center justify-center transition-all cursor-pointer group"
            >
              {!isPlaying && (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-slate-900/80 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play className="w-5 h-5 sm:w-7 sm:h-7 fill-white translate-x-0.5" />
                </div>
              )}
            </div>

            {/* Quick Badge & Peek Overlay */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
              <div className="bg-slate-950/85 backdrop-blur-md px-2 py-1 rounded-lg sm:rounded-xl border border-slate-800 text-[9px] sm:text-[11px] text-teal-400 font-mono flex items-center gap-1 sm:gap-1.5 shadow-lg">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="truncate max-w-[80px] sm:max-w-none">{config.templateId}</span>
                <span className="text-slate-500 hidden sm:inline">|</span>
                <span className="hidden sm:inline">{dim.width}x{dim.height}</span>
              </div>

              {/* Hold to Peek Before Button (Pointer events enabled) */}
              <button
                id="btn-peek-before"
                onMouseDown={() => setIsPeekingBefore(true)}
                onMouseUp={() => setIsPeekingBefore(false)}
                onMouseLeave={() => setIsPeekingBefore(false)}
                onTouchStart={() => setIsPeekingBefore(true)}
                onTouchEnd={() => setIsPeekingBefore(false)}
                className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-900/90 hover:bg-slate-800 text-rose-300 border border-rose-500/30 text-[9px] sm:text-xs font-bold shadow-lg transition-all active:scale-95 select-none"
                title="اضغط واستمر للمقارنة اللحظية مع صورة البداية Before"
              >
                <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-rose-400" />
                <span>معاينة (قبل)</span>
              </button>
            </div>
          </div>

          {/* Player Scrub Bar & Keyframe Timeline */}
          <div className="w-full space-y-1.5 sm:space-y-2.5 bg-slate-900 lg:bg-slate-950/80 p-2 sm:p-3 lg:p-4 rounded-xl border border-slate-800 lg:border-slate-800">
            {/* Timeline Progress Bar with markers */}
            <div className="relative w-full py-1">
              <input
                id="timeline-scrubber"
                type="range"
                min="0"
                max={config.duration}
                step="0.03"
                value={currentTime}
                onChange={(e) => handleScrub(parseFloat(e.target.value))}
                className="w-full accent-teal-400 cursor-pointer h-2 sm:h-2.5 bg-slate-800 rounded-lg"
              />

              {/* Visual Transition Zone Highlight */}
              <div
                className="absolute top-1 bottom-1 pointer-events-none bg-teal-500/20 rounded border-x border-teal-400/50"
                style={{
                  left: `${((config.duration - config.transitionDuration) * 0.35 / config.duration) * 100}%`,
                  width: `${(config.transitionDuration / config.duration) * 100}%`,
                }}
              />
            </div>

            {/* Playback Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs pt-0.5 sm:pt-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Play / Pause - Large Touch Friendly */}
                <button
                  id="btn-toggle-play"
                  onClick={togglePlay}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center transition-colors font-bold shadow-md shadow-teal-500/20 active:scale-95 shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950" />
                  ) : (
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950 translate-x-0.5" />
                  )}
                </button>

                {/* Reset to 0 */}
                <button
                  id="btn-rewind"
                  onClick={() => handleScrub(0)}
                  className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                  title="إعادة للبداية"
                >
                  <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>

                {/* Time Display */}
                <span className="font-mono text-slate-200 font-bold px-1 text-[10px] sm:text-xs whitespace-nowrap">
                  {currentTime.toFixed(1)}s <span className="text-slate-500">/</span> {config.duration.toFixed(1)}s
                </span>
              </div>

              {/* Right Side Playback Modifiers */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {/* Speed selector */}
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                  className="bg-slate-950 lg:bg-slate-900 border border-slate-800 text-slate-300 rounded-lg sm:rounded-xl px-1 sm:px-2 py-1 sm:py-1.5 text-[10px] sm:text-xs font-mono focus:border-teal-500"
                >
                  <option value="0.5">0.5x</option>
                  <option value="1.0">1.0x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2.0">2.0x</option>
                </select>

                {/* Loop Toggle */}
                <button
                  onClick={() => setIsLooping(!isLooping)}
                  className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition-colors ${
                    isLooping
                      ? "bg-teal-500/20 border-teal-500 text-teal-400"
                      : "bg-slate-950 lg:bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                  title="تكرار تلقائي (Loop)"
                >
                  <Repeat className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>

                {/* Mute Toggle */}
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl border transition-colors ${
                    isMuted
                      ? "bg-rose-500/20 border-rose-500 text-rose-400"
                      : "bg-slate-950 lg:bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                  title={isMuted ? "إلغاء كتم الصوت" : "كتم الصوت"}
                >
                  {isMuted ? <VolumeX className="w-3 h-3 sm:w-4 sm:h-4" /> : <Volume2 className="w-3 h-3 sm:w-4 sm:h-4 text-teal-400" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom/Right Side: Studio Controls & Configuration Tabs */}
        <div className="lg:col-span-5 flex-1 flex flex-col bg-slate-950 lg:bg-slate-900 lg:border border-slate-800 lg:rounded-2xl lg:shadow-xl overflow-hidden min-h-0 z-0">

          {/* Tab Navigation (Sticky on mobile) */}
          <div className="grid grid-cols-5 border-b border-slate-900 lg:border-slate-800 bg-slate-900 lg:bg-slate-950/60 p-1 sm:p-1.5 gap-1 shrink-0 sticky top-0 z-10">
            <button
              id="tab-template"
              onClick={() => setActiveTab("template")}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-bold transition-colors ${
                activeTab === "template"
                  ? "bg-teal-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 lg:hover:bg-slate-800"
              }`}
            >
              <Zap className="w-4 h-4 mb-0.5 sm:mb-1" />
              <span>القوالب</span>
            </button>

            <button
              id="tab-motion"
              onClick={() => setActiveTab("motion")}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-bold transition-colors ${
                activeTab === "motion"
                  ? "bg-teal-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 lg:hover:bg-slate-800"
              }`}
            >
              <Sliders className="w-4 h-4 mb-0.5 sm:mb-1" />
              <span>الحركة</span>
            </button>

            <button
              id="tab-branding"
              onClick={() => setActiveTab("branding")}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-bold transition-colors ${
                activeTab === "branding"
                  ? "bg-teal-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 lg:hover:bg-slate-800"
              }`}
            >
              <ShieldCheck className="w-4 h-4 mb-0.5 sm:mb-1" />
              <span>الهوية</span>
            </button>

            <button
              id="tab-audio"
              onClick={() => setActiveTab("audio")}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-bold transition-colors ${
                activeTab === "audio"
                  ? "bg-teal-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 lg:hover:bg-slate-800"
              }`}
            >
              <Music className="w-4 h-4 mb-0.5 sm:mb-1" />
              <span>الصوت</span>
            </button>

            <button
              id="tab-text"
              onClick={() => setActiveTab("text")}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[11px] font-bold transition-colors ${
                activeTab === "text"
                  ? "bg-teal-500 text-slate-950 shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50 lg:hover:bg-slate-800"
              }`}
            >
              <Type className="w-4 h-4 mb-0.5 sm:mb-1" />
              <span>النصوص</span>
            </button>
          </div>

          {/* Tab Content Body (Scrollable) */}
          <div className="p-3 sm:p-4 lg:p-5 overflow-y-auto flex-1 space-y-4 pb-safe">
            {/* 1. TEMPLATES TAB */}
            {activeTab === "template" && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    اختر نمط الفيديو التجميلي:
                  </span>
                  <button
                    onClick={onOpenSmileAI}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-500/30 hover:border-purple-400 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>اقتراح ذكي بـ AI</span>
                  </button>
                </div>

                {/* Category Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: "all", label: "الكل (12)" },
                    { id: "luxury", label: "💎 فخامة وتجميل" },
                    { id: "clinical", label: "🔬 مقارنة وسريري" },
                    { id: "social", label: "📱 ريلز وتيك توك" },
                    { id: "classic", label: "✨ مينيمل وكلاسيك" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setTemplateCategory(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        templateCategory === cat.id
                          ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                          : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Template List */}
                <div className="grid grid-cols-1 gap-2.5">
                  {TEMPLATES.filter(
                    (t) => templateCategory === "all" || t.category === templateCategory
                  ).map((tmpl) => {
                    const isSelected = config.templateId === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        id={`template-card-${tmpl.id}`}
                        onClick={() => {
                          updateConfig({ ...config, templateId: tmpl.id }, `تغيير القالب إلى ${tmpl.name}`);
                          // Scrub to middle to let user immediately inspect the transition style
                          handleScrub(config.duration * 0.45);
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                          isSelected
                            ? "bg-teal-950/40 border-teal-500/60 shadow-lg shadow-teal-500/10 ring-1 ring-teal-500/30"
                            : "bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="flex-1 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-bold text-white">{tmpl.name}</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20 font-medium">
                              {tmpl.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{tmpl.desc}</p>
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center mt-0.5 shrink-0 ${
                            isSelected ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/30" : "border border-slate-700"
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. MOTION & TRANSITIONS TAB */}
            {activeTab === "motion" && (
              <div className="space-y-4">
                {/* Total Duration */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      <span>مدة الفيديو الإجمالية</span>
                    </span>
                    <span className="text-teal-400 font-mono font-bold">{config.duration} ثوانٍ</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="14"
                    step="1"
                    value={config.duration}
                    onChange={(e) => updateConfig({ ...config, duration: parseInt(e.target.value) })}
                    className="w-full accent-teal-400"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>4 ثوانٍ (سريع)</span>
                    <span>6-8 ثوانٍ (مثالي)</span>
                    <span>14 ثانية (مفصل)</span>
                  </div>
                </div>

                {/* Transition Duration */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>سرعة الانتقال والمسح (Transition Duration)</span>
                    <span className="text-teal-400 font-mono font-bold">{config.transitionDuration}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="3.0"
                    step="0.1"
                    value={config.transitionDuration}
                    onChange={(e) => updateConfig({ ...config, transitionDuration: parseFloat(e.target.value) })}
                    className="w-full accent-teal-400"
                  />
                </div>

                {/* Camera Zoom & Pan Movement */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    حركة الكاميرا السينمائية (Camera Dynamic Motion):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "ken-burns", label: "سينمائي (Ken Burns)" },
                      { id: "zoom-in", label: "تكبير تدريجي (Zoom In)" },
                      { id: "zoom-out", label: "تصغير تدريجي (Zoom Out)" },
                      { id: "parallax-shift", label: "عمق ثلاثي (Parallax)" },
                      { id: "pan-left-to-right", label: "مسح لليمين (Pan Right)" },
                      { id: "pan-right-to-left", label: "مسح لليسار (Pan Left)" },
                      { id: "subtle-breathe", label: "تنفس هادئ (Breathe)" },
                      { id: "static", label: "ثابت بدون حركة (Static)" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => updateConfig({ ...config, zoomEffect: opt.id as ZoomEffectType })}
                        className={`p-2.5 rounded-xl text-xs font-medium text-right border transition-all ${
                          config.zoomEffect === opt.id
                            ? "bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-sm shadow-teal-500/10"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {config.zoomEffect !== "static" && (
                    <div className="pt-2 space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>شدة التكبير / الإزاحة (Intensity)</span>
                        <span className="font-mono text-teal-400">{config.zoomIntensity}x</span>
                      </div>
                      <input
                        type="range"
                        min="1.05"
                        max="1.35"
                        step="0.02"
                        value={config.zoomIntensity}
                        onChange={(e) => updateConfig({ ...config, zoomIntensity: parseFloat(e.target.value) })}
                        className="w-full accent-teal-400"
                      />
                    </div>
                  )}
                </div>

                {/* Sparkle effects on teeth */}
                <div className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <div>
                      <span className="text-xs font-bold text-white block">لمعان بريق الأسنان (Sparkles)</span>
                      <span className="text-[10px] text-slate-400">تأثير ضوئي يحاكي شفافية المينا بعد العلاج</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enableSparkles}
                    onChange={(e) => updateConfig({ ...config, enableSparkles: e.target.checked })}
                    className="w-4 h-4 accent-teal-400 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 3. BRANDING & WATERMARK TAB */}
            {activeTab === "branding" && (
              <div className="space-y-4">
                {/* Doctor & Clinic Identity */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-slate-200 block">بيانات وهوية الطبيب والعيادة</span>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اسم الطبيب المعالج</label>
                    <input
                      type="text"
                      value={config.branding.doctorName}
                      onChange={(e) =>
                        updateConfig({
                          ...config,
                          branding: { ...config.branding, doctorName: e.target.value },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-teal-500"
                      placeholder="د. أحمد المنصور"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">اسم العيادة أو المركز</label>
                    <input
                      type="text"
                      value={config.branding.clinicName}
                      onChange={(e) =>
                        updateConfig({
                          ...config,
                          branding: { ...config.branding, clinicName: e.target.value },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-teal-500"
                      placeholder="Elite Smile Dental Art"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">عنوان الإجراء / الشعار</label>
                    <input
                      type="text"
                      value={config.branding.tagline}
                      onChange={(e) =>
                        updateConfig({
                          ...config,
                          branding: { ...config.branding, tagline: e.target.value },
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-teal-500"
                      placeholder="8 عدسات E-Max خزفية بدون نحت"
                    />
                  </div>
                </div>

                {/* Logo Upload */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-300">شعار العيادة (Logo Watermark)</span>
                    <input
                      type="file"
                      ref={logoInputRef}
                      onChange={handleLogoUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-400 text-xs font-semibold"
                    >
                      {config.branding.logoUrl ? "تغيير الشعار" : "رفع شعار العيادة"}
                    </button>
                  </div>

                  {config.branding.logoUrl && (
                    <div className="flex items-center gap-3 pt-2">
                      <img
                        src={config.branding.logoUrl}
                        alt="Clinic Logo"
                        className="w-12 h-12 object-contain bg-slate-900 rounded-lg p-1 border border-slate-800"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>شفافية الشعار</span>
                          <span>{Math.round(config.branding.watermarkOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.2"
                          max="1.0"
                          step="0.05"
                          value={config.branding.watermarkOpacity}
                          onChange={(e) =>
                            updateConfig({
                              ...config,
                              branding: { ...config.branding, watermarkOpacity: parseFloat(e.target.value) },
                            })
                          }
                          className="w-full accent-teal-400"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Accent Color Palette */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">لون التمييز (Accent Color)</span>
                  <div className="flex items-center gap-2">
                    {COLOR_PALETTES.map((pal) => (
                      <button
                        key={pal.color}
                        onClick={() =>
                          updateConfig({
                            ...config,
                            branding: { ...config.branding, accentColor: pal.color },
                          })
                        }
                        className={`w-7 h-7 rounded-full transition-transform ${
                          config.branding.accentColor === pal.color
                            ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: pal.color }}
                        title={pal.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Overlays Toggles */}
                <div className="space-y-2">
                  {[
                    { key: "showDoctorName", label: "إظهار اسم الطبيب والعيادة" },
                    { key: "showTreatmentBadge", label: "إظهار شريط نوع الإجراء في الأسفل" },
                    { key: "showShadeComparison", label: "إظهار مقارنة درجة البياض (Shade: A3 ➔ BL1)" },
                    { key: "showAnimatedProgressBar", label: "إظهار شريط التقدم العلوي (Social Reel Bar)" },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 cursor-pointer"
                    >
                      <span className="text-xs text-slate-300">{item.label}</span>
                      <input
                        type="checkbox"
                        checked={(config.branding as any)[item.key]}
                        onChange={(e) =>
                          updateConfig({
                            ...config,
                            branding: { ...config.branding, [item.key]: e.target.checked },
                          })
                        }
                        className="w-4 h-4 accent-teal-400"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 4. AUDIO & MUSIC TAB */}
            {activeTab === "audio" && (
              <div className="space-y-4">
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>مستوى الصوت (Volume)</span>
                    <span className="text-teal-400 font-mono">{Math.round(config.audio.volume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.audio.volume}
                    onChange={(e) =>
                      updateConfig({
                        ...config,
                        audio: { ...config.audio, volume: parseFloat(e.target.value) },
                      })
                    }
                    className="w-full accent-teal-400"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-300 block">
                    المكتبة الموسيقية الطبية المدمجة (Royalty-Free):
                  </span>
                  {AUDIO_TRACKS.map((trk) => {
                    const isSelected = config.audio.trackId === trk.id;
                    return (
                      <div
                        key={trk.id}
                        onClick={() => {
                          if (trk.id === "custom") {
                            customAudioInputRef.current?.click();
                          } else {
                            updateConfig({
                              ...config,
                              audio: { ...config.audio, trackId: trk.id },
                            });
                          }
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                          isSelected
                            ? "bg-teal-950/40 border-teal-500/50"
                            : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">{trk.name}</span>
                            {trk.id === "custom" && config.audio.customAudioName && (
                              <span className="text-[10px] text-teal-400 truncate max-w-[120px]">
                                ({config.audio.customAudioName})
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">{trk.mood}</span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            isSelected ? "bg-teal-500" : "border border-slate-700"
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 bg-slate-950 rounded-full" />}
                        </div>
                      </div>
                    );
                  })}
                  <input
                    type="file"
                    ref={customAudioInputRef}
                    onChange={handleCustomAudioUpload}
                    accept="audio/*"
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* 5. TEXT OVERLAYS TAB */}
            {activeTab === "text" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">النصوص والعلامات السريرية المؤقتة</span>
                  <button
                    onClick={() => {
                      const newId = `txt-${Date.now()}`;
                      updateConfig({
                        ...config,
                        textOverlays: [
                          ...config.textOverlays,
                          {
                            id: newId,
                            text: "✨ نتيجة فورية بدون ألم",
                            timeStart: 1.0,
                            timeEnd: 4.5,
                            position: "bottom",
                            style: "badge",
                          },
                        ],
                      });
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold hover:bg-teal-500/30"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة نص</span>
                  </button>
                </div>

                {/* Quick Clinical Preset Stickers */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-400 block">ملصقات سريرية جاهزة بنقرة واحدة:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "✨ ابتسامة هوليوود بدون نحت",
                      "💎 8 عدسات E-Max خزفية",
                      "🌟 إغلاق الفلجة Diastema",
                      "⚡ تبييض ليزري فوري",
                      "🔬 تقويم شفاف وتجميل حواف",
                      "👑 فينيرز VIP فائقة الشفافية",
                    ].map((badgeText) => (
                      <button
                        key={badgeText}
                        onClick={() => {
                          const newId = `txt-${Date.now()}`;
                          updateConfig({
                            ...config,
                            textOverlays: [
                              ...config.textOverlays,
                              {
                                id: newId,
                                text: badgeText,
                                timeStart: 1.0,
                                timeEnd: Math.min(config.duration, 5.0),
                                position: "bottom",
                                style: "badge",
                              },
                            ],
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-teal-300 font-medium transition-all"
                      >
                        + {badgeText}
                      </button>
                    ))}
                  </div>
                </div>

                {config.textOverlays.length === 0 ? (
                  <div className="p-5 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
                    لا توجد نصوص إضافية. انقر على إحدى الملصقات الجاهزة أعلاه أو "إضافة نص مخصص".
                  </div>
                ) : (
                  <div className="space-y-3">
                    {config.textOverlays.map((overlay, index) => (
                      <div
                        key={overlay.id}
                        className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={overlay.text}
                            onChange={(e) => {
                              const updated = [...config.textOverlays];
                              updated[index].text = e.target.value;
                              updateConfig({ ...config, textOverlays: updated });
                            }}
                            className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white focus:border-teal-500"
                            placeholder="اكتب النص السريري هنا..."
                          />
                          <button
                            onClick={() => {
                              const filtered = config.textOverlays.filter((_, i) => i !== index);
                              updateConfig({ ...config, textOverlays: filtered });
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                          <div>
                            <label className="block mb-0.5">البداية (ثانية)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={overlay.timeStart}
                              onChange={(e) => {
                                const updated = [...config.textOverlays];
                                updated[index].timeStart = parseFloat(e.target.value) || 0;
                                updateConfig({ ...config, textOverlays: updated });
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-white font-mono text-center"
                            />
                          </div>
                          <div>
                            <label className="block mb-0.5">النهاية (ثانية)</label>
                            <input
                              type="number"
                              step="0.5"
                              value={overlay.timeEnd}
                              onChange={(e) => {
                                const updated = [...config.textOverlays];
                                updated[index].timeEnd = parseFloat(e.target.value) || 0;
                                updateConfig({ ...config, textOverlays: updated });
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-white font-mono text-center"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar for Mobile One-Hand Reach */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/90 flex items-center justify-between gap-2 z-40 shadow-2xl">
        <button
          onClick={onOpenAlignmentStudio}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold active:scale-95 transition-all"
        >
          <Sliders className="w-4 h-4 text-teal-400" />
          <span>محاذاة الصور</span>
        </button>

        <button
          onClick={onOpenExportModal}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/20 active:scale-95 transition-all"
        >
          <Download className="w-4 h-4 stroke-[2.5]" />
          <span>تصدير الفيديو MP4</span>
        </button>
      </div>
    </div>
  );
};
