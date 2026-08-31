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

  // AI Smart Align handler
  const handleAiSmartAlign = async () => {
    if (!beforePhoto?.url || !afterPhoto?.url) return;
    setIsAiAligning(true);
    setAiMessage(null);
    try {
      const response = await fetch("/api/ai/smart-align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeImageBase64: beforePhoto.url,
          afterImageBase64: afterPhoto.url,
        }),
      });
      const data = await response.json();
      if (data.success && data.suggestions) {
        const s = data.suggestions;
        setAfterAlign((prev) => ({
          ...prev,
          scale: s.scaleDelta || 1.0,
          rotation: s.rotationDelta || 0,
          offsetX: s.offsetX || 0,
          offsetY: s.offsetY || 0,
        }));
        setAiMessage(s.tips || "تمت المحاذاة الذكية تلقائياً بنجاح.");
      }
    } catch (e) {
      console.warn("AI alignment error:", e);
      setAiMessage("تم ضبط المحاذاة المركزية الافتراضية.");
    } finally {
      setIsAiAligning(false);
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-6xl max-h-[92vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">استوديو محاذاة وقص الصور السريرية</h2>
              <p className="text-xs text-slate-400">
                تطابق دقيق لمستوى الأسنان والخط المتوسط لتوليد فيديو بدون أي اهتزاز تشريحي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-ai-smart-align"
              onClick={handleAiSmartAlign}
              disabled={isAiAligning}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {isAiAligning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-purple-200" />
              )}
              <span>محاذاة ذكية بـ Smile AI</span>
            </button>

            <button
              id="btn-close-align-modal"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Canvas on Left, Controls on Right */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
          {/* Main Interactive Canvas (8 cols) */}
          <div className="lg:col-span-8 bg-slate-950 p-4 flex flex-col items-center justify-center relative overflow-hidden border-b lg:border-b-0 lg:border-l border-slate-800">
            {/* View Mode Bar on Top of Canvas */}
            <div className="absolute top-4 z-10 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md p-1 rounded-xl border border-slate-800">
              <button
                id="btn-mode-blend"
                onClick={() => setDisplayMode("blend")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  displayMode === "blend"
                    ? "bg-teal-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                تطابق الشفافية (Blend)
              </button>
              <button
                id="btn-mode-split"
                onClick={() => setDisplayMode("split")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  displayMode === "split"
                    ? "bg-teal-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                مسطرة المقارنة (Split)
              </button>
              <button
                id="btn-mode-flicker"
                onClick={() => setDisplayMode("flicker")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  displayMode === "flicker"
                    ? "bg-teal-500 text-slate-950 shadow"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                وميض متناوب (Flicker)
              </button>
            </div>

            {/* Canvas */}
            <div className="relative w-full max-w-[620px] aspect-[4/3] rounded-xl overflow-hidden shadow-2xl border border-slate-800 flex items-center justify-center">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
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
              <div className="mt-3 px-4 py-2 rounded-xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-200 text-xs flex items-center gap-2 max-w-md">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            )}

            {/* Bottom Quick Landmark Toggles */}
            <div className="mt-3 flex items-center flex-wrap gap-2 text-xs">
              <button
                id="toggle-midline"
                onClick={() => setShowMidline(!showMidline)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
                  showMidline
                    ? "bg-red-950/60 border-red-500/40 text-red-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <span>خط الوسط (Midline)</span>
              </button>

              <button
                id="toggle-incisal"
                onClick={() => setShowIncisalPlane(!showIncisalPlane)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
                  showIncisalPlane
                    ? "bg-cyan-950/60 border-cyan-500/40 text-cyan-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <span>مستوى الإطباق الأفقي</span>
              </button>

              <button
                id="toggle-golden"
                onClick={() => setShowGoldenGrid(!showGoldenGrid)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
                  showGoldenGrid
                    ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <span>النسبة الذهبية (1.618)</span>
              </button>

              <button
                id="toggle-grid3x3"
                onClick={() => setShowGrid3x3(!showGrid3x3)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
                  showGrid3x3
                    ? "bg-slate-800 border-slate-600 text-slate-200"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <span>شبكة 3×3</span>
              </button>
            </div>
          </div>

          {/* Right Controls Panel (4 cols) */}
          <div className="lg:col-span-4 p-5 flex flex-col justify-between bg-slate-900 overflow-y-auto space-y-5">
            <div className="space-y-4">
              {/* Active Layer Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  الصورة المراد ضبطها:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    id="layer-after"
                    onClick={() => setActiveLayer("after")}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                      activeLayer === "after"
                        ? "bg-emerald-500 text-slate-950 shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    صورة بعد (AFTER)
                  </button>
                  <button
                    id="layer-before"
                    onClick={() => setActiveLayer("before")}
                    className={`py-2 px-3 text-xs font-bold rounded-lg transition-all ${
                      activeLayer === "before"
                        ? "bg-rose-500 text-white shadow"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    صورة قبل (BEFORE)
                  </button>
                </div>
              </div>

              {/* Opacity Crossfader (if in blend mode) */}
              {displayMode === "blend" && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-300 font-medium">
                    <span>شفافية التطابق (Overlay Opacity)</span>
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
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>قبل فقط</span>
                    <span>تطابق 50%</span>
                    <span>بعد فقط</span>
                  </div>
                </div>
              )}

              {/* Scale Control */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <ZoomIn className="w-3.5 h-3.5 text-teal-400" />
                    <span>التكبير والتحجيم (Scale)</span>
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
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>زاوية الدوران (Rotation)</span>
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
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>-10°</span>
                  <span>0°</span>
                  <span>+10°</span>
                </div>
              </div>

              {/* Pan Offset X & Y */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-2">
                <span className="flex items-center gap-1.5 text-xs text-slate-300 font-medium">
                  <Move className="w-3.5 h-3.5 text-indigo-400" />
                  <span>الإزاحة الأفقية والعمودية (Pan X / Y)</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">أفقي X (px)</label>
                    <input
                      type="number"
                      value={currentAlign.offsetX}
                      onChange={(e) =>
                        setCurrentAlign((prev) => ({ ...prev, offsetX: parseInt(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white text-center font-mono focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">عمودي Y (px)</label>
                    <input
                      type="number"
                      value={currentAlign.offsetY}
                      onChange={(e) =>
                        setCurrentAlign((prev) => ({ ...prev, offsetY: parseInt(e.target.value) || 0 }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white text-center font-mono focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Utility Quick Buttons: Flip & Reset */}
              <div className="flex gap-2">
                <button
                  id="btn-flip-h"
                  onClick={() =>
                    setCurrentAlign((prev) => ({ ...prev, flipH: !prev.flipH }))
                  }
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    currentAlign.flipH
                      ? "bg-teal-500/20 border-teal-500 text-teal-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  <span>عكس أفقي (Mirror)</span>
                </button>

                <button
                  id="btn-reset-align"
                  onClick={() =>
                    setCurrentAlign(() => ({
                      scale: 1.0,
                      rotation: 0,
                      offsetX: 0,
                      offsetY: 0,
                      flipH: false,
                    }))
                  }
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 text-xs font-semibold transition-colors"
                  title="إعادة تعيين القيم"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Bottom Actions: Cancel & Save */}
            <div className="pt-4 border-t border-slate-800 flex gap-2">
              <button
                id="btn-cancel-align"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
              >
                إلغاء
              </button>
              <button
                id="btn-save-align"
                onClick={handleSave}
                className="flex-1 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>حفظ المحاذاة</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
