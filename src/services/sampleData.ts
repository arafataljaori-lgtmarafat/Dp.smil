import { ClinicProfile, PatientCase, VideoProjectConfig } from "../types";

export const INITIAL_CLINIC_PROFILE: ClinicProfile = {
  id: "clinic-default",
  clinicName: "Elite Smile Dental Art",
  doctorName: "أحمد المنصور",
  specialty: "استشاري تجميل وزراعة الأسنان الرقمية",
  instagramHandle: "@dr.almansour_smile",
  phone: "+966 50 123 4567",
  logoUrl: null,
  themeColor: "#14b8a6",
};

export function createDefaultVideoConfig(templateId: any = "cinematic-reveal", profile?: ClinicProfile): VideoProjectConfig {
  const clinic = profile || INITIAL_CLINIC_PROFILE;
  return {
    templateId,
    aspectRatio: "9:16",
    duration: 6,
    fps: 30,
    transitionDuration: 1.5,
    transitionType: "curtain-horizontal",
    zoomEffect: "zoom-in",
    zoomIntensity: 1.15,
    enableSparkles: true,
    enableMotionBlur: false,
    enableScanlineEffect: false,
    branding: {
      clinicName: clinic.clinicName,
      doctorName: clinic.doctorName,
      tagline: "ابتسامة طبيعية متناسقة بدقة ميكروسكوبية",
      logoUrl: clinic.logoUrl,
      watermarkPosition: "top-left",
      watermarkOpacity: 0.9,
      badgeStyle: "clinical-teal",
      showShadeComparison: true,
      showTreatmentBadge: true,
      showDoctorName: true,
      showClinicLogo: true,
      showAnimatedProgressBar: true,
      customFooter: `${clinic.clinicName} • د. ${clinic.doctorName}`,
      accentColor: clinic.themeColor || "#14b8a6",
    },
    audio: {
      trackId: "luxury-aesthetics",
      volume: 0.85,
      enableBeats: true,
    },
    textOverlays: [
      {
        id: "txt-1",
        text: "✨ 8 عدسات E-Max خزفية بدون نحت جائر",
        timeStart: 0.8,
        timeEnd: 4.5,
        position: "bottom",
        style: "badge",
      },
    ],
  };
}

export const DEFAULT_VIDEO_CONFIG: VideoProjectConfig = createDefaultVideoConfig();

// Generate high quality procedural dental clinical photos as Data URLs
export function createProceduralDentalImage(type: "before" | "after", scenario: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Soft clinical portrait background
  const bgGrad = ctx.createRadialGradient(600, 450, 100, 600, 450, 700);
  bgGrad.addColorStop(0, "#1e293b");
  bgGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 900);

  // Lip contour & mouth frame
  ctx.save();
  ctx.fillStyle = type === "after" ? "#db2777" : "#be123c"; // Lipstick / natural lip tone
  ctx.beginPath();
  ctx.ellipse(600, 440, 420, 180, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dark oral cavity
  ctx.fillStyle = "#180509";
  ctx.beginPath();
  ctx.ellipse(600, 450, 360, 110, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upper Gingiva (Gums)
  const gumGrad = ctx.createLinearGradient(0, 340, 0, 420);
  gumGrad.addColorStop(0, type === "after" ? "#f472b6" : "#fb7185");
  gumGrad.addColorStop(1, type === "after" ? "#ec4899" : "#e11d48");
  ctx.fillStyle = gumGrad;
  ctx.beginPath();
  ctx.ellipse(600, 370, 340, 70, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw Teeth (Upper Anterior Incisors: 13, 12, 11, 21, 22, 23)
  const isAfter = type === "after";
  const teethData = [
    { x: 370, y: 440, w: 60, h: 90, type: "canine_r", rot: isAfter ? 0 : -0.08 },
    { x: 440, y: 445, w: 65, h: 95, type: "lat_r", rot: isAfter ? 0 : 0.06 },
    { x: 520, y: 450, w: 76, h: 110, type: "cent_r", rot: isAfter ? 0 : -0.04 },
    { x: 604, y: 450, w: 76, h: 110, type: "cent_l", rot: isAfter ? 0 : 0.05 },
    { x: 686, y: 445, w: 65, h: 95, type: "lat_l", rot: isAfter ? 0 : -0.07 },
    { x: 756, y: 440, w: 60, h: 90, type: "canine_l", rot: isAfter ? 0 : 0.09 },
  ];

  teethData.forEach((t) => {
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y);
    ctx.rotate(t.rot);

    // Enamel base color
    let toothColor = isAfter ? "#ffffff" : "#fef08a"; // BL1 white vs A3 yellow
    if (scenario === "bonding" && !isAfter) toothColor = "#fef9c3";

    const toothGrad = ctx.createLinearGradient(0, -t.h / 2, 0, t.h / 2);
    if (isAfter) {
      toothGrad.addColorStop(0, "#f8fafc");
      toothGrad.addColorStop(0.7, "#ffffff");
      toothGrad.addColorStop(1, "#e2e8f0"); // Incisal translucency
    } else {
      toothGrad.addColorStop(0, "#fef08a");
      toothGrad.addColorStop(0.6, "#fef3c7");
      toothGrad.addColorStop(1, "#cbd5e1");
    }

    ctx.fillStyle = toothGrad;
    ctx.strokeStyle = isAfter ? "#e2e8f0" : "#d97706";
    ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 8;

    // Tooth shape with rounded incisal edges
    ctx.beginPath();
    const cornerR = isAfter ? 12 : 6;
    ctx.roundRect(-t.w / 2, -t.h / 2, t.w, t.h, [cornerR, cornerR, cornerR * 0.7, cornerR * 0.7]);
    ctx.fill();
    ctx.stroke();

    // Natural specular light reflection stripe
    ctx.fillStyle = isAfter ? "rgba(255, 255, 255, 0.75)" : "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.roundRect(-t.w * 0.3, -t.h * 0.35, t.w * 0.15, t.h * 0.65, 4);
    ctx.fill();

    // Chipped tooth defect in "before"
    if (!isAfter && scenario === "chipped" && (t.type === "cent_r" || t.type === "cent_l")) {
      ctx.fillStyle = "#180509";
      ctx.beginPath();
      ctx.arc(0, t.h / 2, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // Diastema gap simulation
    if (!isAfter && scenario === "diastema" && t.type === "cent_r") {
      ctx.fillStyle = "#180509";
      ctx.fillRect(t.w / 2 - 8, -t.h / 2, 10, t.h);
    }

    ctx.restore();
  });

  // Lower teeth subtle silhouette
  ctx.fillStyle = isAfter ? "#f1f5f9" : "#fef08a";
  ctx.beginPath();
  ctx.ellipse(600, 520, 240, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // Clinical Watermark Stamp in corner
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(type === "before" ? "PRE-OP (BEFORE)" : "POST-OP (AFTER)", 80, 820);
  ctx.fillText("DentPilot Clinical Record", 80, 850);

  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.92);
}

export const SAMPLE_CASES: PatientCase[] = [

  {
    id: "case-veneers-01",
    patientCode: "DP-2026-081",
    patientName: "سارة عبد الله (Sarah A.)",
    age: 28,
    gender: "female",
    treatmentType: "8 عدسات إيماكس خزفية (E-Max Veneers)",
    procedureDate: "2026-08-15",
    shadeBefore: "A3.5",
    shadeAfter: "BL1",
    doctorName: "أحمد المنصور",
    clinicName: "Elite Smile Dental Art",
    notes: "حالة تصبغات فلورية مع عدم تناسق خط الابتسامة. تم تصميم الابتسامة رقمياً وعمل 8 عدسات خزفية مع إبراز شفافية الحواف القاطعة.",
    tags: ["Veneers", "E-Max", "Smile Makeover", "Hollywood Smile", "تجميل الأسنان"],
    videoConfig: {
      ...DEFAULT_VIDEO_CONFIG,
      templateId: "cinematic-reveal",
      branding: {
        ...DEFAULT_VIDEO_CONFIG.branding,
        tagline: "ابتسامة هوليوود المتناسقة • 8 عدسات E-Max",
        customFooter: "عيادة النخبة • د. أحمد المنصور",
      },
    },
    photos: [
      {
        id: "p-b1",
        role: "before",
        url: createProceduralDentalImage("before", "discoloration"),
        label: "قبل العلاج - ابتسامة أمامية",
        takenAt: "2026-08-01",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
      {
        id: "p-a1",
        role: "after",
        url: createProceduralDentalImage("after", "discoloration"),
        label: "بعد العلاج - 8 عدسات E-Max",
        takenAt: "2026-08-15",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
    ],
    versions: [
      {
        id: "v-1",
        timestamp: "2026-08-15T14:30:00Z",
        note: "إنشاء الحالة وإضافة الصور السريرية الأولية",
        author: "د. أحمد المنصور",
        configSnapshot: DEFAULT_VIDEO_CONFIG,
      },
    ],
    createdAt: "2026-08-15T14:30:00Z",
    updatedAt: "2026-08-15T14:30:00Z",
  },
  {
    id: "case-diastema-02",
    patientCode: "DP-2026-092",
    patientName: "فيصل الشمري (Faisal Sh.)",
    age: 32,
    gender: "male",
    treatmentType: "إغلاق الفلجة وتجميل الأسنان المركب (Direct Bonding)",
    procedureDate: "2026-08-20",
    shadeBefore: "A2",
    shadeAfter: "BL2",
    doctorName: "ريم القحطاني",
    clinicName: "DentPilot Aesthetic Clinic",
    notes: "إغلاق مسافة بين الثنايا العلوية (Midline Diastema) في جلسة واحدة بدون تخدير أو برد لطبقة المينا.",
    tags: ["Diastema", "Composite Bonding", "No Prep", "فلجة الأسنان"],
    videoConfig: {
      ...DEFAULT_VIDEO_CONFIG,
      templateId: "split-slider",
      branding: {
        ...DEFAULT_VIDEO_CONFIG.branding,
        doctorName: "ريم القحطاني",
        clinicName: "DentPilot Aesthetic Clinic",
        tagline: "إغلاق الفلجة في جلسة واحدة بدون حك",
        accentColor: "#38bdf8",
      },
    },
    photos: [
      {
        id: "p-b2",
        role: "before",
        url: createProceduralDentalImage("before", "diastema"),
        label: "قبل العلاج - فراغ بين الأسنان",
        takenAt: "2026-08-20",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
      {
        id: "p-a2",
        role: "after",
        url: createProceduralDentalImage("after", "diastema"),
        label: "بعد العلاج - تناسق تام",
        takenAt: "2026-08-20",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
    ],
    versions: [
      {
        id: "v-1",
        timestamp: "2026-08-20T10:00:00Z",
        note: "الإصدار الأولي - قالب Split Slider",
        author: "د. ريم القحطاني",
        configSnapshot: DEFAULT_VIDEO_CONFIG,
      },
    ],
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
  },
  {
    id: "case-chipped-03",
    patientCode: "DP-2026-104",
    patientName: "نورة المالكي (Noura M.)",
    age: 24,
    gender: "female",
    treatmentType: "ترميم كسر السن الأمامي بالكمبوزيت الطبقي",
    procedureDate: "2026-08-26",
    shadeBefore: "A1 (Chipped)",
    shadeAfter: "A1 Layered",
    doctorName: "أحمد المنصور",
    clinicName: "Elite Smile Dental Art",
    notes: "ترميم كسر في القاطع المركزي إثر حادث بسيط. تم استخدام تقنية الحشو التجميلي متعدد الطبقات لمحاكاة شفافية حافة السن الطبيعي.",
    tags: ["Chipped Tooth", "Direct Composite", "Emergency", "ترميم سن مكسور"],
    videoConfig: {
      ...DEFAULT_VIDEO_CONFIG,
      templateId: "spotlight-zoom",
      branding: {
        ...DEFAULT_VIDEO_CONFIG.branding,
        tagline: "ترميم كسر السن الأمامي بطبقات متدرجة",
        accentColor: "#f59e0b",
      },
    },
    photos: [
      {
        id: "p-b3",
        role: "before",
        url: createProceduralDentalImage("before", "chipped"),
        label: "قبل العلاج - كسر القاطع الأيمن",
        takenAt: "2026-08-26",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
      {
        id: "p-a3",
        role: "after",
        url: createProceduralDentalImage("after", "chipped"),
        label: "بعد العلاج - تطابق طبيعي 100%",
        takenAt: "2026-08-26",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      },
    ],
    versions: [],
    createdAt: "2026-08-26T16:00:00Z",
    updatedAt: "2026-08-26T16:00:00Z",
  },
];

export const INITIAL_SAMPLE_CASES = SAMPLE_CASES;

