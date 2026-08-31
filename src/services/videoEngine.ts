import {
  AspectRatioType,
  DimensionConfig,
  PhotoAlignment,
  TemplateId,
  VideoProjectConfig,
} from "../types";
import { audioEngine } from "./audioEngine";

export const ASPECT_RATIOS: Record<AspectRatioType, DimensionConfig> = {
  "9:16": {
    width: 1080,
    height: 1920,
    label: "9:16 ريلز وتيك توك",
    iconName: "Smartphone",
    recommendedFor: "Instagram Reels, TikTok, YouTube Shorts, Stories",
  },
  "4:5": {
    width: 1080,
    height: 1350,
    label: "4:5 بوست إنستغرام",
    iconName: "Square",
    recommendedFor: "Instagram Feed Post (Portrait)",
  },
  "1:1": {
    width: 1080,
    height: 1080,
    label: "1:1 مربع كلاسيكي",
    iconName: "Grid",
    recommendedFor: "Facebook & Instagram Square Post",
  },
  "16:9": {
    width: 1920,
    height: 1080,
    label: "16:9 عريض لاندسكيب",
    iconName: "Monitor",
    recommendedFor: "Clinic TV Display, YouTube, Website Hero",
  },
};

export interface RenderContextImages {
  beforeImg: HTMLImageElement | null;
  afterImg: HTMLImageElement | null;
  logoImg: HTMLImageElement | null;
}

export class DentalVideoEngine {
  private static imageCache = new Map<string, HTMLImageElement>();

  public static async loadImage(url: string): Promise<HTMLImageElement> {
    if (this.imageCache.has(url)) {
      const cached = this.imageCache.get(url)!;
      if (cached.complete && cached.naturalWidth > 0) return cached;
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        this.imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = (e) => reject(e);
      img.src = url;
    });
  }

  // Draw an aligned image with clinical transformations (rotation, scale, offset, mirror)
  private static drawTransformedImage(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    canvasWidth: number,
    canvasHeight: number,
    alignment: PhotoAlignment,
    cameraScale = 1.0,
    cameraPanX = 0,
    cameraPanY = 0
  ) {
    ctx.save();
    const centerX = canvasWidth / 2 + (alignment.offsetX || 0) + cameraPanX;
    const centerY = canvasHeight / 2 + (alignment.offsetY || 0) + cameraPanY;

    ctx.translate(centerX, centerY);
    if (alignment.rotation) {
      ctx.rotate((alignment.rotation * Math.PI) / 180);
    }
    if (alignment.flipH) {
      ctx.scale(-1, 1);
    }

    const baseScale = (alignment.scale || 1.0) * cameraScale;
    // Calculate best fit cover
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = canvasWidth / canvasHeight;
    let drawW: number;
    let drawH: number;

    if (imgAspect > canvasAspect) {
      drawH = canvasHeight * baseScale;
      drawW = drawH * imgAspect;
    } else {
      drawW = canvasWidth * baseScale;
      drawH = drawW / imgAspect;
    }

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  // Sparkle stars for teeth whitening / aesthetic effect
  private static drawSparkles(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    progress: number,
    color: string
  ) {
    const sparkles = [
      { x: canvasWidth * 0.42, y: canvasHeight * 0.48, phase: 0.1, size: 28 },
      { x: canvasWidth * 0.58, y: canvasHeight * 0.50, phase: 0.4, size: 34 },
      { x: canvasWidth * 0.35, y: canvasHeight * 0.53, phase: 0.7, size: 22 },
      { x: canvasWidth * 0.65, y: canvasHeight * 0.52, phase: 0.25, size: 24 },
    ];

    sparkles.forEach((s) => {
      const localT = (progress + s.phase) % 1;
      if (localT < 0.6) {
        const opacity = Math.sin((localT / 0.6) * Math.PI);
        const radius = s.size * (0.5 + 0.5 * Math.sin(localT * Math.PI));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(localT * Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity * 0.9;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;

        // 4-point sparkle star
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.lineTo(0, radius);
          ctx.lineTo(radius * 0.25, radius * 0.25);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    });
  }

  // Draw modern clinical branding, stamps, logo, and metadata overlay
  public static drawBrandingOverlay(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    config: VideoProjectConfig,
    t: number,
    images: RenderContextImages,
    phase: "before" | "transition" | "after"
  ) {
    const { branding, duration } = config;
    const progress = t / duration;

    // 1. Top Animated Progress Bar (Reels & Stories style)
    if (branding.showAnimatedProgressBar) {
      const barHeight = Math.max(6, canvasHeight * 0.005);
      ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
      ctx.fillRect(0, 0, canvasWidth, barHeight);

      // Gradient progress bar
      const grad = ctx.createLinearGradient(0, 0, canvasWidth * progress, 0);
      grad.addColorStop(0, branding.accentColor || "#14b8a6");
      grad.addColorStop(1, "#38bdf8");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvasWidth * progress, barHeight);
    }

    // 2. Clinic Logo & Watermark
    if (branding.showClinicLogo && images.logoImg && branding.logoUrl) {
      ctx.save();
      ctx.globalAlpha = branding.watermarkOpacity;
      const logoSize = Math.min(canvasWidth * 0.16, 160);
      const padding = canvasWidth * 0.04;
      let logoX = padding;
      let logoY = padding + 20;

      if (branding.watermarkPosition === "top-right") {
        logoX = canvasWidth - logoSize - padding;
      } else if (branding.watermarkPosition === "bottom-left") {
        logoY = canvasHeight - logoSize - padding - 60;
      } else if (branding.watermarkPosition === "bottom-right") {
        logoX = canvasWidth - logoSize - padding;
        logoY = canvasHeight - logoSize - padding - 60;
      } else if (branding.watermarkPosition === "top-center") {
        logoX = (canvasWidth - logoSize) / 2;
      }

      // Rounded container for logo
      ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
      ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(logoX - 8, logoY - 8, logoSize + 16, logoSize * 0.6 + 16, 16);
      ctx.fill();

      ctx.drawImage(images.logoImg, logoX, logoY, logoSize, logoSize * 0.6);
      ctx.restore();
    }

    // 3. Doctor & Clinic Header Ribbon (if logo not top or in addition)
    if (branding.showDoctorName && (branding.doctorName || branding.clinicName)) {
      ctx.save();
      const padX = canvasWidth * 0.04;
      const padY = canvasHeight * 0.035;
      const cardW = Math.min(canvasWidth * 0.72, 600);
      const cardH = Math.max(68, canvasHeight * 0.045);
      const cardX = canvasWidth - cardW - padX;
      const cardY = padY + (branding.showAnimatedProgressBar ? 10 : 0);

      // Glassmorphism background
      ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 20);
      ctx.fill();
      ctx.stroke();

      // Clinic accent indicator dot
      ctx.fillStyle = branding.accentColor || "#14b8a6";
      ctx.beginPath();
      ctx.arc(cardX + cardW - 24, cardY + cardH / 2, 7, 0, Math.PI * 2);
      ctx.fill();

      // Texts
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(cardH * 0.36)}px 'Cairo', sans-serif`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const docTitle = branding.doctorName ? `د. ${branding.doctorName}` : branding.clinicName;
      ctx.fillText(docTitle, cardX + cardW - 42, cardY + cardH * 0.36);

      ctx.fillStyle = "#94a3b8";
      ctx.font = `500 ${Math.round(cardH * 0.26)}px 'Cairo', sans-serif`;
      const subTitle = branding.clinicName && branding.doctorName ? branding.clinicName : branding.tagline || "عيادة طب وتجميل الأسنان";
      ctx.fillText(subTitle, cardX + cardW - 42, cardY + cardH * 0.72);
      ctx.restore();
    }

    // 4. Clinical State Badges: "BEFORE" vs "AFTER" Floating Badges
    const badgeW = Math.max(130, canvasWidth * 0.18);
    const badgeH = Math.max(46, canvasHeight * 0.032);
    const badgeY = canvasHeight * 0.18;

    if (phase === "before" || phase === "transition") {
      ctx.save();
      const bx = canvasWidth * 0.05;
      ctx.fillStyle = "rgba(239, 68, 68, 0.85)"; // Red before badge
      ctx.shadowColor = "rgba(239, 68, 68, 0.4)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(bx, badgeY, badgeW, badgeH, 12);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(badgeH * 0.48)}px 'Cairo', 'Plus Jakarta Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("BEFORE • قبل", bx + badgeW / 2, badgeY + badgeH / 2);
      ctx.restore();
    }

    if (phase === "after" || phase === "transition") {
      ctx.save();
      const bx = canvasWidth - badgeW - canvasWidth * 0.05;
      ctx.fillStyle = "rgba(16, 185, 129, 0.9)"; // Green after badge
      ctx.shadowColor = "rgba(16, 185, 129, 0.4)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.roundRect(bx, badgeY, badgeW, badgeH, 12);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.round(badgeH * 0.48)}px 'Cairo', 'Plus Jakarta Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("AFTER • بعد", bx + badgeW / 2, badgeY + badgeH / 2);
      ctx.restore();
    }

    // 5. Bottom Treatment & Shade Comparison Banner
    if (branding.showTreatmentBadge || branding.showShadeComparison) {
      ctx.save();
      const bannerW = Math.min(canvasWidth * 0.9, 880);
      const bannerH = Math.max(76, canvasHeight * 0.055);
      const bannerX = (canvasWidth - bannerW) / 2;
      const bannerY = canvasHeight - bannerH - canvasHeight * 0.04;

      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 20);
      ctx.fill();
      ctx.stroke();

      // Treatment Type pill
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = branding.accentColor || "#14b8a6";
      ctx.font = `bold ${Math.round(bannerH * 0.32)}px 'Cairo', sans-serif`;
      ctx.fillText(branding.tagline || "تصميم ابتسامة هوليوود", bannerX + bannerW - 24, bannerY + bannerH * 0.35);

      // Custom footer / Clinic slogan
      ctx.fillStyle = "#cbd5e1";
      ctx.font = `500 ${Math.round(bannerH * 0.24)}px 'Cairo', sans-serif`;
      ctx.fillText(branding.customFooter || "DentPilot Studio • نتائج واقعية بدقة سريرية", bannerX + bannerW - 24, bannerY + bannerH * 0.72);

      // Left side: Shade or result pill
      if (branding.showShadeComparison) {
        const pillW = Math.max(160, bannerW * 0.28);
        const pillH = bannerH * 0.6;
        const pillX = bannerX + 18;
        const pillY = bannerY + (bannerH - pillH) / 2;

        ctx.fillStyle = "rgba(20, 184, 166, 0.18)";
        ctx.strokeStyle = branding.accentColor || "#14b8a6";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 14);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.round(pillH * 0.44)}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillText("SHADE: A3 ➔ BL1", pillX + pillW / 2, pillY + pillH / 2);
      }
      ctx.restore();
    }

    // 6. Timed Custom Text Overlays
    if (config.textOverlays && config.textOverlays.length > 0) {
      config.textOverlays.forEach((overlay) => {
        if (t >= overlay.timeStart && t <= overlay.timeEnd) {
          ctx.save();
          const overlayProgress = (t - overlay.timeStart) / (overlay.timeEnd - overlay.timeStart);
          const alpha = Math.min(1, Math.sin(overlayProgress * Math.PI) * 1.5);
          ctx.globalAlpha = alpha;

          let oy = canvasHeight * 0.5;
          if (overlay.position === "top") oy = canvasHeight * 0.28;
          if (overlay.position === "bottom") oy = canvasHeight * 0.72;

          ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
          ctx.strokeStyle = branding.accentColor || "#38bdf8";
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
          ctx.shadowBlur = 16;

          const textWidth = ctx.measureText(overlay.text).width + 60;
          const boxW = Math.max(260, textWidth);
          const boxH = Math.max(54, canvasHeight * 0.038);
          const boxX = (canvasWidth - boxW) / 2;

          ctx.beginPath();
          ctx.roundRect(boxX, oy - boxH / 2, boxW, boxH, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(boxH * 0.44)}px 'Cairo', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(overlay.text, canvasWidth / 2, oy);
          ctx.restore();
        }
      });
    }
  }

  // Master frame renderer: Pure, deterministic function of time `t` (0 <= t <= duration)
  public static renderFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    t: number,
    config: VideoProjectConfig,
    images: RenderContextImages,
    beforeAlign: PhotoAlignment,
    afterAlign: PhotoAlignment
  ) {
    const { duration, transitionDuration, templateId, zoomIntensity, zoomEffect } = config;
    ctx.clearRect(0, 0, width, height);

    // Deep modern dark clinical background
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, width, height);

    if (!images.beforeImg && !images.afterImg) {
      ctx.fillStyle = "#64748b";
      ctx.font = "24px 'Cairo', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("يرجى اختيار صور الحالة Before & After للبدء", width / 2, height / 2);
      return;
    }

    // Time timeline breakdown
    // 0 -> startTrans: Before phase
    // startTrans -> endTrans: Transition phase
    // endTrans -> duration: After phase
    const startTrans = Math.max(0.5, (duration - transitionDuration) * 0.35);
    const endTrans = startTrans + transitionDuration;

    // Camera Zoom & Pan interpolation
    const progress = Math.max(0, Math.min(1, t / duration));
    let cameraScale = 1.0;
    let cameraPanX = 0;
    let cameraPanY = 0;

    if (zoomEffect === "zoom-in") {
      cameraScale = 1.0 + (zoomIntensity - 1.0) * progress;
    } else if (zoomEffect === "zoom-out") {
      cameraScale = zoomIntensity - (zoomIntensity - 1.0) * progress;
    } else if (zoomEffect === "pan-left-to-right") {
      cameraPanX = (progress - 0.5) * (width * 0.08);
      cameraScale = 1.06;
    } else if (zoomEffect === "subtle-breathe") {
      cameraScale = 1.0 + Math.sin(progress * Math.PI * 2) * 0.04;
    }

    let phase: "before" | "transition" | "after" = "before";
    if (t < startTrans) {
      phase = "before";
    } else if (t >= startTrans && t <= endTrans) {
      phase = "transition";
    } else {
      phase = "after";
    }

    const transProgress =
      t < startTrans ? 0 : t > endTrans ? 1 : (t - startTrans) / transitionDuration;

    // Easing function for smooth professional feel
    const ease = (p: number) =>
      p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    const easedT = ease(transProgress);

    // ==========================================
    // TEMPLATE RENDERING LOGIC (Deterministic)
    // ==========================================
    if (templateId === "cinematic-reveal" || templateId === "curtain-wipe") {
      // 1. Draw Before Image
      if (images.beforeImg) {
        this.drawTransformedImage(ctx, images.beforeImg, width, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
      }

      // 2. Draw After Image with Curtain Wipe Clip
      if (images.afterImg && easedT > 0) {
        ctx.save();
        const wipeX = width * easedT;
        ctx.beginPath();
        ctx.rect(0, 0, wipeX, height);
        ctx.clip();

        this.drawTransformedImage(ctx, images.afterImg, width, height, afterAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();

        // Glowing Laser Line Divider
        if (easedT < 1.0 && easedT > 0.0) {
          ctx.save();
          ctx.strokeStyle = config.branding.accentColor || "#14b8a6";
          ctx.lineWidth = 4;
          ctx.shadowColor = config.branding.accentColor || "#38bdf8";
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(wipeX, 0);
          ctx.lineTo(wipeX, height);
          ctx.stroke();

          // Center Handle / Pill
          const handleH = Math.max(64, height * 0.04);
          const handleW = 14;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.roundRect(wipeX - handleW / 2, (height - handleH) / 2, handleW, handleH, 7);
          ctx.fill();
          ctx.restore();
        }
      }
    } else if (templateId === "split-slider") {
      // Split Slider: Before on left, After on right with moving split
      // Oscillator sweep or linear sweep
      const splitPos = width * (0.15 + 0.7 * Math.sin(progress * Math.PI));

      if (images.beforeImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitPos, height);
        ctx.clip();
        this.drawTransformedImage(ctx, images.beforeImg, width, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      if (images.afterImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(splitPos, 0, width - splitPos, height);
        ctx.clip();
        this.drawTransformedImage(ctx, images.afterImg, width, height, afterAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      // Slider bar
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(splitPos, 0);
      ctx.lineTo(splitPos, height);
      ctx.stroke();

      // Circular Diamond Handle
      const cy = height / 2;
      ctx.fillStyle = config.branding.accentColor || "#14b8a6";
      ctx.beginPath();
      ctx.arc(splitPos, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Small arrows
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("◀ ▶", splitPos, cy);
      ctx.restore();
    } else if (templateId === "spotlight-zoom") {
      // Spotlight Zoom: High zoom exploring center incisors, then aperture opens
      if (images.beforeImg) {
        this.drawTransformedImage(ctx, images.beforeImg, width, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
      }

      if (images.afterImg && easedT > 0) {
        ctx.save();
        const maxRadius = Math.sqrt(width * width + height * height) * 0.65;
        const currentRadius = maxRadius * easedT;

        ctx.beginPath();
        ctx.arc(width / 2, height / 2, currentRadius, 0, Math.PI * 2);
        ctx.clip();

        this.drawTransformedImage(ctx, images.afterImg, width, height, afterAlign, cameraScale * (1.1 - 0.1 * easedT), cameraPanX, cameraPanY);
        ctx.restore();

        // Spotlight glowing border
        if (easedT < 0.99) {
          ctx.save();
          ctx.strokeStyle = config.branding.accentColor || "#38bdf8";
          ctx.lineWidth = 5;
          ctx.shadowColor = config.branding.accentColor || "#38bdf8";
          ctx.shadowBlur = 25;
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, currentRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    } else if (templateId === "dual-side-by-side") {
      // Side by side dual window
      const halfW = width / 2;
      const margin = 8;

      if (images.beforeImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, halfW - margin / 2, height);
        ctx.clip();
        this.drawTransformedImage(ctx, images.beforeImg, halfW, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      if (images.afterImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(halfW + margin / 2, 0, halfW - margin / 2, height);
        ctx.clip();
        ctx.translate(halfW + margin / 2, 0);
        this.drawTransformedImage(ctx, images.afterImg, halfW, height, afterAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      // Vertical separator
      ctx.fillStyle = config.branding.accentColor || "#14b8a6";
      ctx.fillRect(halfW - margin / 2, 0, margin, height);
    } else if (templateId === "glow-morph" || templateId === "social-story-reel" || templateId === "pulse-reveal") {
      // Glow Morph / Crossfade with Enamel Shine
      if (images.beforeImg) {
        ctx.save();
        ctx.globalAlpha = 1.0 - easedT;
        this.drawTransformedImage(ctx, images.beforeImg, width, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      if (images.afterImg) {
        ctx.save();
        ctx.globalAlpha = easedT;
        this.drawTransformedImage(ctx, images.afterImg, width, height, afterAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();
      }

      // Glow burst at transition peak
      if (easedT > 0.3 && easedT < 0.8) {
        const peak = Math.sin(((easedT - 0.3) / 0.5) * Math.PI);
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.globalAlpha = peak * 0.45;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } else {
      // Default: Diagonal Sweep
      if (images.beforeImg) {
        this.drawTransformedImage(ctx, images.beforeImg, width, height, beforeAlign, cameraScale, cameraPanX, cameraPanY);
      }
      if (images.afterImg && easedT > 0) {
        ctx.save();
        const sweep = (width + height) * easedT;
        ctx.beginPath();
        ctx.moveTo(sweep, 0);
        ctx.lineTo(0, sweep);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.clip();
        this.drawTransformedImage(ctx, images.afterImg, width, height, afterAlign, cameraScale, cameraPanX, cameraPanY);
        ctx.restore();

        if (easedT < 1.0) {
          ctx.save();
          ctx.strokeStyle = config.branding.accentColor || "#14b8a6";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(sweep, 0);
          ctx.lineTo(0, sweep);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Sparkles on tooth surface after reveal
    if (config.enableSparkles && easedT > 0.4) {
      this.drawSparkles(ctx, width, height, progress, config.branding.accentColor || "#38bdf8");
    }

    // Branding & Overlay HUD
    this.drawBrandingOverlay(ctx, width, height, config, t, images, phase);
  }

  // Export full video deterministically with Canvas + MediaRecorder + Web Audio API
  public static async exportVideo(
    config: VideoProjectConfig,
    images: RenderContextImages,
    beforeAlign: PhotoAlignment,
    afterAlign: PhotoAlignment,
    onProgress: (percent: number, currentSec: number) => void
  ): Promise<Blob> {
    const dim = ASPECT_RATIOS[config.aspectRatio];
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = dim.width;
    exportCanvas.height = dim.height;
    const ctx = exportCanvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not get canvas 2d context for export");

    // Audio stream preparation
    const audioCtx = audioEngine.getAudioContext();
    const audioDest = audioCtx ? audioCtx.createMediaStreamDestination() : null;

    if (audioCtx && audioDest && config.audio.trackId !== "none" && config.audio.volume > 0) {
      audioEngine.start(config.audio, config.duration, 0);
    }

    // Canvas stream with desired FPS
    const canvasStream = exportCanvas.captureStream(config.fps);
    const combinedStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((vt) => combinedStream.addTrack(vt));

    if (audioDest && audioDest.stream.getAudioTracks().length > 0) {
      audioDest.stream.getAudioTracks().forEach((at) => combinedStream.addTrack(at));
    }

    // Check supported mime types
    const mimeTypes = [
      "video/mp4;codecs=avc1",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    let selectedMime = "video/webm";
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) {
        selectedMime = m;
        break;
      }
    }

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 12000000, // 12 Mbps pristine crisp video
    });

    const recordedChunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        audioEngine.stop();
        const finalBlob = new Blob(recordedChunks, { type: selectedMime });
        resolve(finalBlob);
      };
      mediaRecorder.onerror = (e) => {
        audioEngine.stop();
        reject(e);
      };

      mediaRecorder.start(100);

      // Real-time synchronous frame dispatch
      const totalFrames = Math.floor(config.duration * config.fps);
      let frameIndex = 0;
      const frameIntervalMs = 1000 / config.fps;

      const renderNextFrame = () => {
        if (frameIndex > totalFrames) {
          mediaRecorder.stop();
          return;
        }

        const currentTime = (frameIndex / config.fps);
        this.renderFrame(ctx, dim.width, dim.height, currentTime, config, images, beforeAlign, afterAlign);

        onProgress(Math.min(100, Math.round((frameIndex / totalFrames) * 100)), currentTime);
        frameIndex++;
        setTimeout(renderNextFrame, frameIntervalMs * 0.6); // slight speedup for recording queue
      };

      renderNextFrame();
    });
  }

  // Export high-resolution still comparison split image
  public static exportStillComparison(
    config: VideoProjectConfig,
    images: RenderContextImages,
    beforeAlign: PhotoAlignment,
    afterAlign: PhotoAlignment
  ): string {
    const dim = ASPECT_RATIOS[config.aspectRatio];
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = dim.width;
    exportCanvas.height = dim.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return "";

    // Render comparison frame at middle of transition
    this.renderFrame(ctx, dim.width, dim.height, config.duration * 0.5, config, images, beforeAlign, afterAlign);
    return exportCanvas.toDataURL("image/png");
  }
}
