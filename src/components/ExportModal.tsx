import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Download,
  Video,
  CheckCircle2,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Loader2,
  Film,
  Share2,
  Sliders,
  Check,
} from "lucide-react";
import confetti from "canvas-confetti";
import { AspectRatioType, CasePhoto, PatientCase, PhotoAlignment, VideoProjectConfig } from "../types";
import { DentalVideoEngine, ASPECT_RATIOS } from "../services/videoEngine";
import { audioEngine } from "../services/audioEngine";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientCase: PatientCase;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  patientCase,
}) => {
  const [resolution, setResolution] = useState<"1080p" | "720p" | "4k">("1080p");
  const [fps, setFps] = useState<30 | 60>(60);
  const [exportFormat, setExportFormat] = useState<"webm" | "mp4">("mp4");
  const [includeAudio, setIncludeAudio] = useState<boolean>(true);

  // Export State
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedPosterUrl, setExportedPosterUrl] = useState<string | null>(null);

  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

  const beforePhoto = patientCase.photos.find((p) => p.role === "before") || null;
  const afterPhoto = patientCase.photos.find((p) => p.role === "after") || null;
  const config = patientCase.videoConfig;

  useEffect(() => {
    if (!isOpen) {
      setIsExporting(false);
      setProgress(0);
      setExportedVideoUrl(null);
      setExportedPosterUrl(null);
    }
  }, [isOpen]);

  // Generate 4K High-Res comparison poster
  const handleExportPoster = async () => {
    if (!beforePhoto?.url || !afterPhoto?.url) return;
    setStatusMessage("جاري إنشاء بوستر المقارنة فائق الدقة (4K)...");

    const canvas = document.createElement("canvas");
    canvas.width = 3840;
    canvas.height = 2160;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dark luxury background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bImg = await DentalVideoEngine.loadImage(beforePhoto.url);
    const aImg = await DentalVideoEngine.loadImage(afterPhoto.url);

    // Draw split
    const halfW = canvas.width / 2;
    ctx.drawImage(bImg, 0, 0, halfW, canvas.height);
    ctx.drawImage(aImg, halfW, 0, halfW, canvas.height);

    // Divider Line
    ctx.strokeStyle = "#14b8a6";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, canvas.height);
    ctx.stroke();

    // Badges & Doctor info
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, canvas.height - 180, canvas.width, 180);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px 'Cairo', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${patientCase.patientName} • ${patientCase.treatmentType}`, canvas.width - 80, canvas.height - 70);

    ctx.fillStyle = "#14b8a6";
    ctx.textAlign = "left";
    ctx.fillText(`${patientCase.clinicName} • د. ${patientCase.doctorName}`, 80, canvas.height - 70);

    const posterData = canvas.toDataURL("image/jpeg", 0.95);
    setExportedPosterUrl(posterData);

    const link = document.createElement("a");
    link.download = `DentPilot-${patientCase.patientCode}-Poster-4K.jpg`;
    link.href = posterData;
    link.click();
  };

  // Main Deterministic Video Render & Export
  const handleStartExport = async () => {
    setIsExporting(true);
    setProgress(0);
    setStatusMessage("جاري تحميل الصور وتهيئة محرك الرسم السريري...");

    try {
      // 1. Load Images
      let bImg: HTMLImageElement | null = null;
      let aImg: HTMLImageElement | null = null;
      let lImg: HTMLImageElement | null = null;

      if (beforePhoto?.url) bImg = await DentalVideoEngine.loadImage(beforePhoto.url);
      if (afterPhoto?.url) aImg = await DentalVideoEngine.loadImage(afterPhoto.url);
      if (config.branding.logoUrl) lImg = await DentalVideoEngine.loadImage(config.branding.logoUrl);

      const loadedImages = { beforeImg: bImg, afterImg: aImg, logoImg: lImg };

      // 2. Determine canvas resolution multiplier
      const baseDim = ASPECT_RATIOS[config.aspectRatio];
      let scaleMult = 1.0;
      if (resolution === "720p") scaleMult = 0.667;
      if (resolution === "4k") scaleMult = 2.0;

      const exportWidth = Math.round(baseDim.width * scaleMult);
      const exportHeight = Math.round(baseDim.height * scaleMult);

      const canvas = document.createElement("canvas");
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context not available");

      // 3. Audio Setup with Web Audio
      let audioStream: MediaStream | null = null;
      if (includeAudio && config.audio.trackId !== "none") {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const dest = audioCtx.createMediaStreamDestination();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          gain.gain.value = 0.001; // subtle carrier to preserve AAC sync
          osc.connect(gain);
          gain.connect(dest);
          osc.start();
          audioStream = dest.stream;
        } catch (e) {
          console.warn("Audio stream initialization fallback", e);
        }
      }

      // 4. Set up Canvas Stream and MediaRecorder
      const canvasStream = canvas.captureStream(fps);
      const combinedTracks = [...canvasStream.getVideoTracks()];
      if (audioStream) {
        combinedTracks.push(...audioStream.getAudioTracks());
      }
      const combinedStream = new MediaStream(combinedTracks);

      const mimeType = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")
        ? "video/mp4;codecs=avc1"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const recordedChunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: resolution === "4k" ? 25000000 : 12000000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      const recorderPromise = new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const videoBlob = new Blob(recordedChunks, { type: mimeType });
          resolve(videoBlob);
        };
      });

      mediaRecorder.start(100);

      // 5. Frame-by-Frame Deterministic Rendering
      const totalFrames = Math.round(config.duration * fps);
      const frameInterval = 1 / fps;

      const beforeAlign: PhotoAlignment =
        beforePhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };
      const afterAlign: PhotoAlignment =
        afterPhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };

      for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
        const t = frameIndex * frameInterval;
        DentalVideoEngine.renderFrame(
          ctx,
          exportWidth,
          exportHeight,
          t,
          config,
          loadedImages,
          beforeAlign,
          afterAlign
        );

        // Update progress
        const percent = Math.min(100, Math.round((frameIndex / totalFrames) * 100));
        setProgress(percent);
        setStatusMessage(`جاري تصيير الإطار السريري ${frameIndex} من ${totalFrames} (${percent}%)...`);

        // Give browser frame breather
        await new Promise((r) => setTimeout(r, 1000 / (fps * 2)));
      }

      setStatusMessage("جاري إنهاء وتجميع مسار الفيديو...");
      mediaRecorder.stop();

      const finalBlob = await recorderPromise;
      const finalUrl = URL.createObjectURL(finalBlob);
      setExportedVideoUrl(finalUrl);
      setIsExporting(false);
      setProgress(100);
      setStatusMessage("اكتمل تصدير الفيديو بنجاح!");

      // Trigger celebratory confetti
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });

      // Auto Download
      const link = document.createElement("a");
      link.download = `DentPilot-${patientCase.patientCode}-${config.templateId}-${config.aspectRatio.replace(":", "x")}.mp4`;
      link.href = finalUrl;
      link.click();
    } catch (err: any) {
      console.error("Export failed", err);
      setIsExporting(false);
      setStatusMessage(`فشل التصدير: ${err.message || "حدث خطأ غير متوقع"}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">تصدير فيديو الحالة السريرية</h2>
              <p className="text-xs text-slate-400">
                {patientCase.patientName} • {config.aspectRatio} • {config.duration} ثوانٍ
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[80vh]">
          {/* Status / Progress view while exporting */}
          {isExporting ? (
            <div className="py-8 space-y-5 text-center">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto text-teal-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-white">جاري تصدير الفيديو بدقة فائقة...</h3>
                <p className="text-xs text-teal-400 font-mono">{statusMessage}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="bg-gradient-to-r from-teal-500 to-cyan-400 h-full rounded-full transition-all duration-150 shadow-lg shadow-teal-500/30"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 font-mono font-bold">{progress}%</span>
            </div>
          ) : exportedVideoUrl ? (
            /* Completed Export View */
            <div className="py-6 space-y-5 text-center animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">تم تصدير وتحميل الفيديو بنجاح!</h3>
                <p className="text-xs text-slate-400">
                  الفيديو جاهز للنشر الفوري على Instagram Reels أو TikTok أو شاشات الانتظار بالعيادة.
                </p>
              </div>

              {/* Download actions */}
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <a
                  href={exportedVideoUrl}
                  download={`DentPilot-${patientCase.patientCode}.mp4`}
                  className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/25 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>إعادة تحميل الفيديو (MP4)</span>
                </a>

                <button
                  onClick={handleExportPoster}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-2"
                >
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  <span>تصدير بوستر مقارنة 4K</span>
                </button>
              </div>
            </div>
          ) : (
            /* Settings View before export */
            <div className="space-y-4">
              {/* Resolution selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">دقة الفيديو (Resolution):</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "1080p", label: "Full HD (1080p)", desc: "الأفضل لـ Instagram & Reels" },
                    { id: "4k", label: "Ultra HD (4K)", desc: "أعلى جودة للعرض والشاشات" },
                    { id: "720p", label: "HD (720p)", desc: "حجم ملف أصغر وأسرع" },
                  ].map((res) => (
                    <button
                      key={res.id}
                      onClick={() => setResolution(res.id as any)}
                      className={`p-3 rounded-xl border text-right transition-all ${
                        resolution === res.id
                          ? "bg-teal-950/40 border-teal-500 text-teal-300"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold block text-white">{res.label}</span>
                      <span className="text-[10px] text-slate-400">{res.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* FPS Toggle */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">معدل الإطارات (Frame Rate):</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFps(60)}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      fps === 60
                        ? "bg-teal-950/40 border-teal-500 text-teal-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block text-white">60 FPS (Ultra Smooth)</span>
                    <span className="text-[10px] text-slate-400">سلاسة سينمائية فائقة بدون تقطيع</span>
                  </button>

                  <button
                    onClick={() => setFps(30)}
                    className={`p-3 rounded-xl border text-right transition-all ${
                      fps === 30
                        ? "bg-teal-950/40 border-teal-500 text-teal-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block text-white">30 FPS (Standard)</span>
                    <span className="text-[10px] text-slate-400">المعدل القياسي المتوافق</span>
                  </button>
                </div>
              </div>

              {/* Audio inclusion toggle */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">تضمين الموسيقى والمؤثرات الصوتية</span>
                  <span className="text-[10px] text-slate-400">
                    المسار المحدد: {config.audio.trackId}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={includeAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              {/* Still 4K Poster Export shortcut */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-400">هل تحتاج بوستر مقارنة ثابت عالي الدقة فقط؟</span>
                <button
                  onClick={handleExportPoster}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>تصدير بوستر 4K (JPG)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isExporting && !exportedVideoUrl && (
          <div className="px-6 py-4 border-t border-slate-800 flex justify-between gap-3 bg-slate-900">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              إلغاء
            </button>

            <button
              id="btn-confirm-render"
              onClick={handleStartExport}
              className="flex-1 px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2"
            >
              <Film className="w-4 h-4 stroke-[2.5]" />
              <span>بدء تصدير الفيديو (Render MP4)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
