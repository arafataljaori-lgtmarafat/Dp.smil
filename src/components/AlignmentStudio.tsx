import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Sparkles,
  RotateCw,
  ZoomIn,
  Move,
  Maximize2,
  Sliders,
  Check,
  Eye,
  EyeOff,
  RotateCcw,
  FlipHorizontal,
  Info,
  Loader2,
} from "lucide-react";
import { CasePhoto, PhotoAlignment } from "../types";

interface AlignmentStudioProps {
  isOpen: boolean;
  onClose: () => void;
  beforePhoto: CasePhoto | null;
  afterPhoto: CasePhoto | null;
  onSaveAlignment: (beforeAlign: PhotoAlignment, afterAlign: PhotoAlignment) => void;
}

export const AlignmentStudio: React.FC<AlignmentStudioProps> = ({
  isOpen,
  onClose,
  beforePhoto,
  afterPhoto,
  onSaveAlignment,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeLayer, setActiveLayer] = useState<"after" | "before">("after");

  const [beforeAlign, setBeforeAlign] = useState<PhotoAlignment>(
    beforePhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false }
  );
  const [afterAlign, setAfterAlign] = useState<PhotoAlignment>(
    afterPhoto?.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false }
  );

  // Display modes: 'blend' (opacity crossfade), 'split' (interactive split line), 'diff' (flicker)
  const [displayMode, setDisplayMode] = useState<"blend" | "split" | "flicker">("blend");
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [splitPosition, setSplitPosition] = useState<number>(0.5);
  const [flickerState, setFlickerState] = useState<"before" | "after">("before");

  // Clinical Guide Overlays
  const [showMidline, setShowMidline] = useState<boolean>(true);
  const [showIncisalPlane, setShowIncisalPlane] = useState<boolean>(true);
  const [showGoldenGrid, setShowGoldenGrid] = useState<boolean>(false);
  const [showGrid3x3, setShowGrid3x3] = useState<boolean>(false);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // AI Smart Align loading
  const [isAiAligning, setIsAiAligning] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  // Cached Image elements
  const [beforeImg, setBeforeImg] = useState<HTMLImageElement | null>(null);
  const [afterImg, setAfterImg] = useState<HTMLImageElement | null>(null);

  // Initialize alignments when photos change
  useEffect(() => {
    if (beforePhoto) {
      setBeforeAlign(beforePhoto.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false });
    }
    if (afterPhoto) {
      setAfterAlign(afterPhoto.alignment || { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false });
    }
  }, [beforePhoto, afterPhoto]);

  // Load images
  useEffect(() => {
    if (!isOpen) return;
    if (beforePhoto?.url) {
      const img = new Image();
      img.src = beforePhoto.url;
      img.onload = () => setBeforeImg(img);
    }
    if (afterPhoto?.url) {
      const img = new Image();
      img.src = afterPhoto.url;
      img.onload = () => setAfterImg(img);
    }
  }, [isOpen, beforePhoto, afterPhoto]);

  // Flicker interval
  useEffect(() => {
    if (displayMode !== "flicker") return;
    const interval = setInterval(() => {
      setFlickerState((prev) => (prev === "before" ? "after" : "before"));
    }, 600);
    return () => clearInterval(interval);
  }, [displayMode]);

  // Draw alignment canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, width, height);

    const drawSingle = (img: HTMLImageElement, align: PhotoAlignment, opacity = 1.0) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      const cx = width / 2 + align.offsetX;
      const cy = height / 2 + align.offsetY;
      ctx.translate(cx, cy);
      if (align.rotation) ctx.rotate((align.rotation * Math.PI) / 180);
      if (align.flipH) ctx.scale(-1, 1);

      const baseScale = align.scale || 1.0;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = width / height;
      let drawW: number;
      let drawH: number;

      if (imgAspect > canvasAspect) {
        drawH = height * baseScale;
        drawW = drawH * imgAspect;
      } else {
        drawW = width * baseScale;
        drawH = drawW / imgAspect;
      }

      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    };

    if (displayMode === "blend") {
      if (beforeImg) drawSingle(beforeImg, beforeAlign, 1.0);
      if (afterImg) drawSingle(afterImg, afterAlign, overlayOpacity);
    } else if (displayMode === "split") {
      const splitX = width * splitPosition;
      if (beforeImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitX, height);
        ctx.clip();
        drawSingle(beforeImg, beforeAlign, 1.0);
        ctx.restore();
      }
      if (afterImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(splitX, 0, width - splitX, height);
        ctx.clip();
        drawSingle(afterImg, afterAlign, 1.0);
        ctx.restore();
      }

      // Split line
      ctx.save();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, height);
      ctx.stroke();

      // Split handle
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(splitX, height / 2, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↔", splitX, height / 2);
      ctx.restore();
    } else if (displayMode === "flicker") {
      if (flickerState === "before" && beforeImg) {
        drawSingle(beforeImg, beforeAlign, 1.0);
      } else if (flickerState === "after" && afterImg) {
        drawSingle(afterImg, afterAlign, 1.0);
      }
    }

    // ===================================
    // Clinical Grid & Dental Landmark Overlays
    // ===================================
    // 1. Dental Midline (Vertical Center Line)
    if (showMidline) {
      ctx.save();
      ctx.strokeStyle = "#ef4444"; // Red laser midline
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();

      // Incisive Papilla Marker
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(width / 2, height * 0.46, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 11px 'Cairo', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("الخط المتوسط (Midline)", width / 2 - 10, height * 0.46);
      ctx.restore();
    }

    // 2. Incisal Plane / Interpupillary Line (Horizontal)
    if (showIncisalPlane) {
      ctx.save();
      ctx.strokeStyle = "#38bdf8"; // Cyan level line
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, height * 0.52);
      ctx.lineTo(width, height * 0.52);
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 11px 'Cairo', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("مستوى الحواف القاطعة (Incisal Plane)", 20, height * 0.52 - 8);
      ctx.restore();
    }

    // 3. Golden Proportion Dental Grid (1.618 : 1.0 : 0.618)
    if (showGoldenGrid) {
      ctx.save();
      ctx.strokeStyle = "rgba(234, 179, 8, 0.7)"; // Gold
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      const mid = width / 2;
      const centralW = width * 0.08;
      const lateralW = centralW * 0.618;
      const canineW = lateralW * 0.618;

      const lines = [
        mid - centralW,
        mid + centralW,
        mid - centralW - lateralW,
        mid + centralW + lateralW,
        mid - centralW - lateralW - canineW,
        mid + centralW + lateralW + canineW,
      ];

      lines.forEach((lx) => {
        ctx.beginPath();
        ctx.moveTo(lx, height * 0.3);
        ctx.lineTo(lx, height * 0.7);
        ctx.stroke();
      });

      ctx.fillStyle = "#eab308";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Golden Ratio (1.618)", mid, height * 0.3 - 6);
      ctx.restore();
    }

    // 4. Rule of Thirds Grid
    if (showGrid3x3) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(width / 3, 0);
      ctx.lineTo(width / 3, height);
      ctx.moveTo((width / 3) * 2, 0);
      ctx.lineTo((width / 3) * 2, height);
      ctx.moveTo(0, height / 3);
      ctx.lineTo(width, height / 3);
      ctx.moveTo(0, (height / 3) * 2);
      ctx.lineTo(width, (height / 3) * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    displayMode,
    overlayOpacity,
    splitPosition,
    flickerState,
    beforeImg,
    afterImg,
    beforeAlign,
    afterAlign,
    showMidline,
    showIncisalPlane,
    showGoldenGrid,
    showGrid3x3,
  ]);

  useEffect(() => {
    if (isOpen) {
      renderCanvas();
    }
  }, [isOpen, renderCanvas]);

  // Drag mouse handler on canvas to pan current active layer
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setDragStart({ x: e.clientX, y: e.clientY });

    if (activeLayer === "after") {
      setAfterAlign((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
    } else {
      setBeforeAlign((prev) => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Simulated AI Smart Align handler (since no backend is present in this iteration)
  const handleAiSmartAlign = async () => {
    if (!beforePhoto?.url || !afterPhoto?.url) return;
    setIsAiAligning(true);
    setAiMessage(null);
    try {
      // Simulate network delay for "AI processing" feel
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Simulated local heuristic: match scaling to default and center
      // A more robust implementation would use client-side OpenCV.js or similar
      setAfterAlign((prev) => ({
        ...prev,
        scale: beforeAlign.scale,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
      }));
      setBeforeAlign((prev) => ({
        ...prev,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
      }));

      setAiMessage("تم توسيط وضبط المحاذاة بنجاح (محاكاة). يرجى التأكيد يدوياً.");
    } catch (e) {
      console.warn("AI alignment error:", e);
      setAiMessage("تعذر إجراء المحاذاة الذكية، يرجى الضبط يدوياً.");
    } finally {
      setIsAiAligning(false);
    }
  };

  const handleResetAlignment = () => {
    setCurrentAlign(() => ({ scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false }));
  };

  const handleCopyAlignment = () => {
    if (activeLayer === "after") {
      setAfterAlign(beforeAlign);
    } else {
      setBeforeAlign(afterAlign);
    }
  };

  const handleSave = () => {
    onSaveAlignment(beforeAlign, afterAlign);
    onClose();
  };

  const currentAlign = activeLayer === "after" ? afterAlign : beforeAlign;
  const setCurrentAlign = (updater: (prev: PhotoAlignment) => PhotoAlignment) => {
    if (activeLayer === "after") {
      setAfterAlign(updater);
    } else {
      setBeforeAlign(updater);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-6xl h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl flex flex-col shadow-2xl border-0 sm:border border-teal-500/20 overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-teal-900/30 bg-teal-950/20 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-bold text-slate-100">استوديو المحاذاة والقص</h2>
              <p className="hidden sm:block text-xs text-slate-400 mt-0.5">
                تطابق دقيق لمستوى الأسنان لتوليد فيديو بدون اهتزاز تشريحي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-ai-smart-align"
              onClick={handleAiSmartAlign}
              disabled={isAiAligning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[10px] sm:text-xs font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-50"
            >
              {isAiAligning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-purple-200" />
              )}
              <span className="hidden sm:inline">محاذاة ذكية</span>
              <span className="sm:hidden">ذكية</span>
            </button>

            <button
              id="btn-close-align-modal"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900/50 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Canvas on Top/Left, Controls on Bottom/Right */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Main Interactive Canvas */}
          <div className="w-full lg:w-2/3 xl:w-3/4 bg-slate-950 p-2 sm:p-4 flex flex-col items-center justify-center relative overflow-hidden border-b lg:border-b-0 lg:border-l border-slate-900 shrink-0 lg:shrink">
            {/* View Mode Bar on Top of Canvas */}
            <div className="absolute top-2 sm:top-4 z-10 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 shadow-xl max-w-[90%] overflow-x-auto">
              <button
                id="btn-mode-blend"
                onClick={() => setDisplayMode("blend")}
                className={`px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  displayMode === "blend"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                تطابق الشفافية
              </button>
              <button
                id="btn-mode-split"
                onClick={() => setDisplayMode("split")}
                className={`px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  displayMode === "split"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                مسطرة المقارنة
              </button>
              <button
                id="btn-mode-flicker"
                onClick={() => setDisplayMode("flicker")}
                className={`px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                  displayMode === "flicker"
                    ? "bg-teal-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                وميض متناوب
              </button>
            </div>

            {/* Canvas Container */}
            <div className="relative w-full max-w-[620px] aspect-[4/3] rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center mt-8 sm:mt-0">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  setIsDragging(true);
                  setDragStart({ x: touch.clientX, y: touch.clientY });
                }}
                onTouchMove={(e) => {
                  if (!isDragging) return;
                  const touch = e.touches[0];
                  const dx = touch.clientX - dragStart.x;
                  const dy = touch.clientY - dragStart.y;
                  setDragStart({ x: touch.clientX, y: touch.clientY });

                  if (activeLayer === "after") {
                    setAfterAlign((prev) => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
                  } else {
                    setBeforeAlign((prev) => ({ ...prev, offsetX: prev.offsetX + dx, offsetY: prev.offsetY + dy }));
                  }
                }}
                onTouchEnd={() => setIsDragging(false)}
                className="w-full h-full object-contain cursor-grab active:cursor-grabbing touch-none"
              />

              {/* Interactive Split slider drag area */}
              {displayMode === "split" && (
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.01"
                  value={splitPosition}
                  onChange={(e) => setSplitPosition(parseFloat(e.target.value))}
                  className="absolute inset-x-4 bottom-4 z-20 accent-teal-400 cursor-ew-resize opacity-80 hover:opacity-100"
                />
              )}
            </div>

            {/* AI Notification Toast */}
            {aiMessage && (
              <div className="absolute top-14 sm:top-16 z-20 px-3 py-1.5 rounded-lg bg-indigo-950/90 border border-indigo-500/30 text-indigo-200 text-[10px] sm:text-xs flex items-center gap-1.5 max-w-[90%] shadow-lg">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">{aiMessage}</span>
              </div>
            )}

            {/* Bottom Quick Landmark Toggles */}
            <div className="mt-3 flex items-center justify-center flex-wrap gap-1.5 sm:gap-2 px-2">
              <button
                id="toggle-midline"
                onClick={() => setShowMidline(!showMidline)}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-colors text-[9px] sm:text-[10px] font-bold ${
                  showMidline
                    ? "bg-red-950/60 border-red-500/40 text-red-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                خط الوسط (Midline)
              </button>

              <button
                id="toggle-incisal"
                onClick={() => setShowIncisalPlane(!showIncisalPlane)}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-colors text-[9px] sm:text-[10px] font-bold ${
                  showIncisalPlane
                    ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                مستوى الإطباق
              </button>

              <button
                id="toggle-golden"
                onClick={() => setShowGoldenGrid(!showGoldenGrid)}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-colors text-[9px] sm:text-[10px] font-bold ${
                  showGoldenGrid
                    ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                النسبة الذهبية
              </button>

              <button
                id="toggle-grid3x3"
                onClick={() => setShowGrid3x3(!showGrid3x3)}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg border transition-colors text-[9px] sm:text-[10px] font-bold ${
                  showGrid3x3
                    ? "bg-slate-800 border-slate-600 text-slate-200"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                شبكة 3×3
              </button>
            </div>
          </div>

          {/* Right Controls Panel (Mobile Bottom) */}
          <div className="w-full lg:w-1/3 xl:w-1/4 p-4 flex flex-col bg-slate-900 overflow-y-auto min-h-0 pb-safe">
            <div className="space-y-4 flex-1">
              {/* Active Layer Selector */}
              <div>
                <label className="text-[10px] sm:text-xs font-bold text-slate-400 block mb-1.5 px-1">
                  الصورة النشطة للضبط:
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    id="layer-after"
                    onClick={() => setActiveLayer("after")}
                    className={`py-2 px-3 text-[10px] sm:text-xs font-bold rounded-lg transition-colors ${
                      activeLayer === "after"
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    صورة بعد (AFTER)
                  </button>
                  <button
                    id="layer-before"
                    onClick={() => setActiveLayer("before")}
                    className={`py-2 px-3 text-[10px] sm:text-xs font-bold rounded-lg transition-colors ${
                      activeLayer === "before"
                        ? "bg-rose-500 text-white"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    صورة قبل (BEFORE)
                  </button>
                </div>

                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={handleCopyAlignment}
                    className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-800 rounded-lg text-[9px] sm:text-[10px] font-bold text-slate-400 transition-colors border border-slate-800 flex items-center justify-center gap-1"
                  >
                    <Info className="w-3 h-3" />
                    <span>نسخ أبعاد {activeLayer === "after" ? "قبل" : "بعد"}</span>
                  </button>
                  <button
                    onClick={handleResetAlignment}
                    className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-rose-950 rounded-lg text-[9px] sm:text-[10px] font-bold text-slate-400 hover:text-rose-400 transition-colors border border-slate-800 flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>إعادة ضبط</span>
                  </button>
                </div>
              </div>

              {/* Opacity Crossfader (if in blend mode) */}
              {displayMode === "blend" && (
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-[10px] sm:text-xs text-slate-300 font-bold px-1">
                    <span>شفافية التطابق</span>
                    <span className="text-teal-400 font-mono">{Math.round(overlayOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
                    className="w-full accent-teal-400"
                  />
                  <div className="flex justify-between text-[9px] text-slate-500 font-bold px-1">
                    <span>قبل فقط</span>
                    <span>50%</span>
                    <span>بعد فقط</span>
                  </div>
                </div>
              )}

              {/* Scale Control */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-300 font-bold px-1">
                  <span className="flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5 text-teal-400" />
                    <span>التحجيم (Scale)</span>
                  </span>
                  <span className="text-teal-400 font-mono">{currentAlign.scale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.35"
                  step="0.01"
                  value={currentAlign.scale}
                  onChange={(e) =>
                    setCurrentAlign((prev) => ({ ...prev, scale: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-teal-400"
                />
              </div>

              {/* Rotation Control */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-[10px] sm:text-xs text-slate-300 font-bold px-1">
                  <span className="flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>زاوية الدوران</span>
                  </span>
                  <span className="text-cyan-400 font-mono">{currentAlign.rotation.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  value={currentAlign.rotation}
                  onChange={(e) =>
                    setCurrentAlign((prev) => ({ ...prev, rotation: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* Pan Offset X & Y */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <span className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-300 font-bold px-1">
                  <Move className="w-3.5 h-3.5 text-indigo-400" />
                  <span>الإزاحة (X / Y)</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">أفقي X</label>
                    <input
                      type="number"
                      value={currentAlign.offsetX}
                      onChange={(e) =>
                        setCurrentAlign((prev) => ({ ...prev, offsetX: parseInt(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:border-teal-500 outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 block mb-1 text-center font-bold">عمودي Y</label>
                    <input
                      type="number"
                      value={currentAlign.offsetY}
                      onChange={(e) =>
                        setCurrentAlign((prev) => ({ ...prev, offsetY: parseInt(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono focus:border-teal-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Utility Quick Button: Flip */}
              <div>
                <button
                  id="btn-flip-h"
                  onClick={() =>
                    setCurrentAlign((prev) => ({ ...prev, flipH: !prev.flipH }))
                  }
                  className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[10px] sm:text-xs font-bold transition-colors ${
                    currentAlign.flipH
                      ? "bg-teal-500/20 border-teal-500 text-teal-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>عكس أفقي (Mirror)</span>
                </button>
              </div>
            </div>

            {/* Bottom Actions: Cancel & Save */}
            <div className="pt-4 mt-4 border-t border-slate-800 flex gap-2 shrink-0">
              <button
                id="btn-cancel-align"
                onClick={onClose}
                className="w-1/3 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                id="btn-save-align"
                onClick={handleSave}
                className="w-2/3 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-[11px] sm:text-xs font-bold shadow-lg shadow-teal-500/25 transition-transform active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
