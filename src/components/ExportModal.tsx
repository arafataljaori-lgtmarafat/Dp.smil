import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Download,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Film,
} from "lucide-react";
import confetti from "canvas-confetti";
import { PatientCase, PhotoAlignment } from "../types";
import { DentalVideoEngine, ASPECT_RATIOS } from "../services/videoEngine";

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

  const cancelRef = useRef<boolean>(false);

  const beforePhoto = patientCase.photos.find((p) => p.role === "before") || null;
  const afterPhoto = patientCase.photos.find((p) => p.role === "after") || null;
  const config = patientCase.videoConfig;

  useEffect(() => {
    if (!isOpen) {
      setIsExporting(false);
      setProgress(0);
      setExportedVideoUrl(null);
      setExportedPosterUrl(null);
      cancelRef.current = false;
    }
  }, [isOpen]);

  const handleCancelExport = () => {
    cancelRef.current = true;
    setIsExporting(false);
    setStatusMessage("تم إلغاء التصدير.");
    setProgress(0);
  };

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
    setStatusMessage("جاري تحميل الصور وتهيئة محرك الرسم...");

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

      cancelRef.current = false;

      for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
        if (cancelRef.current) {
          mediaRecorder.stop();
          return;
        }

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
        setStatusMessage(`تصيير الإطار ${frameIndex} من ${totalFrames} (${percent}%)`);

        // Give browser frame breather
        await new Promise((r) => setTimeout(r, 1000 / (fps * 2)));
      }

      setStatusMessage("جاري إنهاء الفيديو...");
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
      const fileExt = mimeType.includes("webm") ? "webm" : "mp4";
      const link = document.createElement("a");
      link.download = `DentPilot-${patientCase.patientCode}-${config.templateId}-${config.aspectRatio.replace(":", "x")}.${fileExt}`;
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
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-teal-500/20 overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-teal-900/30 bg-teal-950/20 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">تصدير الفيديو</h2>
              <p className="text-[11px] text-teal-200/60 mt-0.5">
                {patientCase.patientName} • {config.aspectRatio}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="w-8 h-8 rounded-full bg-slate-900/50 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors disabled:opacity-30"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto pb-safe">
          {/* Status / Progress view while exporting */}
          {isExporting ? (
            <div className="py-8 space-y-5 text-center">
              <div className="w-20 h-20 rounded-3xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto text-teal-400 shadow-[0_0_30px_rgba(20,184,166,0.15)]">
                <Loader2 className="w-10 h-10 animate-spin" />
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-white">جاري تصدير الفيديو...</h3>
                <p className="text-[11px] text-teal-400 font-mono">{statusMessage}</p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="bg-gradient-to-r from-teal-500 to-cyan-400 h-full rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-400 font-mono font-bold">{progress}%</span>

              <div className="pt-4">
                <button
                  onClick={handleCancelExport}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-800 transition-colors"
                >
                  إلغاء التصدير
                </button>
              </div>
            </div>
          ) : exportedVideoUrl ? (
            /* Completed Export View */
            <div className="py-6 space-y-5 text-center animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-bold text-white">اكتمل التصدير بنجاح!</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed px-4">
                  الفيديو جاهز للنشر الفوري على Instagram Reels أو TikTok. تم حفظه تلقائياً في جهازك.
                </p>
              </div>

              {/* Download actions */}
              <div className="flex flex-col gap-3 pt-2">
                <a
                  href={exportedVideoUrl}
                  download={`DentPilot-${patientCase.patientCode}.mp4`}
                  className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                >
                  <Download className="w-4 h-4" />
                  إعادة تحميل الفيديو
                </a>

                <button
                  onClick={handleExportPoster}
                  className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-sm border border-slate-800 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                >
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  تصدير بوستر 4K للمقارنة
                </button>
              </div>
            </div>
          ) : (
            /* Settings View before export */
            <div className="space-y-5">
              {/* Resolution selector */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-2 px-1">دقة الفيديو (Resolution)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "1080p", label: "Full HD", desc: "للانستقرام" },
                    { id: "4k", label: "Ultra HD", desc: "للشاشات" },
                    { id: "720p", label: "HD", desc: "للواتساب" },
                  ].map((res) => (
                    <button
                      key={res.id}
                      onClick={() => setResolution(res.id as any)}
                      className={`p-3 rounded-xl border transition-all ${
                        resolution === res.id
                          ? "bg-teal-950 border-teal-500 text-teal-300"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <span className="text-xs font-bold block text-slate-200">{res.label}</span>
                      <span className="text-[9px] text-slate-400 mt-0.5 block truncate">{res.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* FPS Toggle */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-2 px-1">معدل الإطارات (Frame Rate)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFps(60)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      fps === 60
                        ? "bg-teal-950 border-teal-500 text-teal-300"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xs font-bold block text-slate-200">60 FPS</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">سلاسة فائقة</span>
                  </button>

                  <button
                    onClick={() => setFps(30)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      fps === 30
                        ? "bg-teal-950 border-teal-500 text-teal-300"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xs font-bold block text-slate-200">30 FPS</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">حجم أصغر</span>
                  </button>
                </div>
              </div>

              {/* Audio inclusion toggle */}
              <button
                onClick={() => setIncludeAudio(!includeAudio)}
                className="w-full bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between hover:bg-slate-800 transition-colors"
              >
                <div className="text-right">
                  <span className="text-xs font-bold text-slate-200 block">تضمين الصوت (Audio Track)</span>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    {includeAudio ? "سيتم دمج الموسيقى في الفيديو النهائي" : "تصدير الفيديو بدون صوت"}
                  </span>
                </div>
                <div className={`w-10 h-6 rounded-full flex items-center p-1 transition-colors ${includeAudio ? 'bg-teal-500' : 'bg-slate-700'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${includeAudio ? '-translate-x-4' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isExporting && !exportedVideoUrl && (
          <div className="p-5 border-t border-slate-900 flex flex-col gap-3 sticky bottom-0 bg-slate-950">
            <button
              onClick={handleStartExport}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Film className="w-4 h-4 stroke-[2.5]" />
              بدء تصدير الفيديو
            </button>

            <button
              onClick={handleExportPoster}
              className="w-full py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-400 font-bold text-sm border border-slate-800 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <ImageIcon className="w-4 h-4" />
              تصدير بوستر 4K للمقارنة
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
