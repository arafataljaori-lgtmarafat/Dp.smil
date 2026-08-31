import React, { useState, useRef } from "react";
import {
  ArrowRight,
  Video,
  Sliders,
  Sparkles,
  Camera,
  Upload,
  Trash2,
  Save,
  Clock,
  History,
  CheckCircle2,
  Calendar,
  User,
  Shield,
  FileText,
  Plus,
  RefreshCw,
} from "lucide-react";
import { CasePhoto, PatientCase, PhotoAlignment } from "../types";
import { createProceduralDentalImage } from "../services/sampleData";

interface CaseDetailViewProps {
  patientCase: PatientCase;
  onSaveCase: (updatedCase: PatientCase, versionNote?: string) => void;
  onOpenStudio: (patientCase: PatientCase) => void;
  onOpenAlignmentStudio: () => void;
  onOpenSmileAI: () => void;
  onBack: () => void;
}

export const CaseDetailView: React.FC<CaseDetailViewProps> = ({
  patientCase,
  onSaveCase,
  onOpenStudio,
  onOpenAlignmentStudio,
  onOpenSmileAI,
  onBack,
}) => {
  const [formData, setFormData] = useState<PatientCase>(patientCase);
  const [versionNote, setVersionNote] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const beforeUploadRef = useRef<HTMLInputElement>(null);
  const afterUploadRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (role: "before" | "after", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const defaultAlign: PhotoAlignment = { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };

      const existingIndex = formData.photos.findIndex((p) => p.role === role);
      let updatedPhotos = [...formData.photos];

      if (existingIndex >= 0) {
        updatedPhotos[existingIndex] = {
          ...updatedPhotos[existingIndex],
          url: base64,
          takenAt: new Date().toISOString().split("T")[0],
        };
      } else {
        updatedPhotos.push({
          id: `p-${Date.now()}`,
          role,
          url: base64,
          label: role === "before" ? "صورة قبل العلاج" : "صورة بعد العلاج",
          takenAt: new Date().toISOString().split("T")[0],
          alignment: defaultAlign,
        });
      }

      const updatedCase = { ...formData, photos: updatedPhotos };
      setFormData(updatedCase);
      onSaveCase(updatedCase, `تحديث صورة (${role === "before" ? "قبل" : "بعد"})`);
    };
    reader.readAsDataURL(file);
  };

  const handleUseSamplePhoto = (role: "before" | "after", scenario: string) => {
    const dataUrl = createProceduralDentalImage(role, scenario);
    const existingIndex = formData.photos.findIndex((p) => p.role === role);
    let updatedPhotos = [...formData.photos];

    if (existingIndex >= 0) {
      updatedPhotos[existingIndex] = {
        ...updatedPhotos[existingIndex],
        url: dataUrl,
      };
    } else {
      updatedPhotos.push({
        id: `p-${Date.now()}`,
        role,
        url: dataUrl,
        label: role === "before" ? "صورة قبل سريرية" : "صورة بعد سريرية",
        alignment: { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false },
      });
    }

    const updated = { ...formData, photos: updatedPhotos };
    setFormData(updated);
    onSaveCase(updated, `استخدام نموذج سريري لصورة ${role}`);
  };

  const handleSave = () => {
    onSaveCase(formData, versionNote.trim() || undefined);
    setVersionNote("");
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const beforePhoto = formData.photos.find((p) => p.role === "before");
  const afterPhoto = formData.photos.find((p) => p.role === "after");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 backdrop-blur-md p-5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            title="رجوع للقائمة"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white">{formData.patientName}</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 font-mono">
                {formData.patientCode}
              </span>
            </div>
            <p className="text-xs text-slate-400">إدارة تفاصيل الحالة السريرية والصور وسجل الإصدارات</p>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenSmileAI}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800 hover:to-indigo-800 text-purple-200 border border-purple-500/30 text-xs font-bold transition-all"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Smile AI</span>
          </button>

          <button
            onClick={() => onOpenStudio(formData)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 transition-all"
          >
            <Video className="w-4 h-4 stroke-[2.5]" />
            <span>فتح استوديو الفيديو</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Photos on Left / Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Photos Section (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-teal-400" />
                <span>صور الحالة السريرية (Before & After)</span>
              </h2>

              {beforePhoto && afterPhoto && (
                <button
                  onClick={onOpenAlignmentStudio}
                  className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 font-bold bg-teal-500/10 px-2.5 py-1 rounded-lg border border-teal-500/20"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>محاذاة وضبط الطبقات</span>
                </button>
              )}
            </div>

            {/* Before & After Photo Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Before Photo Card */}
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>قبل العلاج (BEFORE)</span>
                  </span>
                  {beforePhoto && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {beforePhoto.takenAt || "جاهزة"}
                    </span>
                  )}
                </div>

                <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
                  {beforePhoto?.url ? (
                    <img
                      src={beforePhoto.url}
                      alt="Before Teeth"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4 space-y-1 text-slate-500">
                      <Camera className="w-8 h-8 mx-auto stroke-1" />
                      <p className="text-xs">لم يتم رفع صورة قبل</p>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => beforeUploadRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 text-xs font-bold shadow"
                    >
                      {beforePhoto ? "تغيير الصورة" : "رفع صورة"}
                    </button>
                  </div>
                </div>

                <input
                  type="file"
                  ref={beforeUploadRef}
                  onChange={(e) => handlePhotoUpload("before", e)}
                  accept="image/*"
                  className="hidden"
                />

                {/* Quick Sample generators */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button
                    onClick={() => beforeUploadRef.current?.click()}
                    className="text-teal-400 hover:underline font-semibold"
                  >
                    رفع من الجهاز
                  </button>
                  <button
                    onClick={() => handleUseSamplePhoto("before", "discoloration")}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    استخدام نموذج تجريبي
                  </button>
                </div>
              </div>

              {/* After Photo Card */}
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>بعد العلاج (AFTER)</span>
                  </span>
                  {afterPhoto && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {afterPhoto.takenAt || "جاهزة"}
                    </span>
                  )}
                </div>

                <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center group">
                  {afterPhoto?.url ? (
                    <img
                      src={afterPhoto.url}
                      alt="After Teeth"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4 space-y-1 text-slate-500">
                      <Camera className="w-8 h-8 mx-auto stroke-1" />
                      <p className="text-xs">لم يتم رفع صورة بعد</p>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => afterUploadRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-teal-500 text-slate-950 text-xs font-bold shadow"
                    >
                      {afterPhoto ? "تغيير الصورة" : "رفع صورة"}
                    </button>
                  </div>
                </div>

                <input
                  type="file"
                  ref={afterUploadRef}
                  onChange={(e) => handlePhotoUpload("after", e)}
                  accept="image/*"
                  className="hidden"
                />

                {/* Quick Sample generators */}
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button
                    onClick={() => afterUploadRef.current?.click()}
                    className="text-teal-400 hover:underline font-semibold"
                  >
                    رفع من الجهاز
                  </button>
                  <button
                    onClick={() => handleUseSamplePhoto("after", "discoloration")}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    استخدام نموذج تجريبي
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Versions History Log Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-teal-400" />
              <span>سجل التعديلات والإصدارات (Version History)</span>
            </h3>

            {formData.versions && formData.versions.length > 0 ? (
              <div className="space-y-2">
                {formData.versions.map((ver, idx) => (
                  <div
                    key={ver.id || idx}
                    className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-200">{ver.note || "تحديث إعدادات الفيديو"}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>بواسطة: {ver.author}</span>
                        <span>•</span>
                        <span>{new Date(ver.timestamp).toLocaleString("ar-SA")}</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 font-mono">
                      {ver.configSnapshot?.templateId || "v1"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">لا توجد إصدارات محفوظة سابقة بعد.</p>
            )}
          </div>
        </div>

        {/* Details & Form Section (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-400" />
            <span>بيانات المريض والمعلومات السريرية</span>
          </h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">اسم المريض</label>
              <input
                type="text"
                value={formData.patientName}
                onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">كود الحالة (ID)</label>
                <input
                  type="text"
                  value={formData.patientCode}
                  onChange={(e) => setFormData({ ...formData, patientCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-teal-400 font-mono focus:border-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">تاريخ الإجراء</label>
                <input
                  type="date"
                  value={formData.procedureDate}
                  onChange={(e) => setFormData({ ...formData, procedureDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">نوع الإجراء الطبي</label>
              <input
                type="text"
                value={formData.treatmentType}
                onChange={(e) => setFormData({ ...formData, treatmentType: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
                placeholder="مثال: 8 عدسات إيماكس خزفية (E-Max Veneers)"
              />
            </div>

            {/* Shades before and after */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div>
                <label className="text-[11px] text-rose-400 font-bold block mb-1">لون السن قبل (Shade Before)</label>
                <input
                  type="text"
                  value={formData.shadeBefore}
                  onChange={(e) => setFormData({ ...formData, shadeBefore: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:border-teal-500"
                  placeholder="A3 / A3.5"
                />
              </div>

              <div>
                <label className="text-[11px] text-emerald-400 font-bold block mb-1">لون السن بعد (Shade After)</label>
                <input
                  type="text"
                  value={formData.shadeAfter}
                  onChange={(e) => setFormData({ ...formData, shadeAfter: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono text-center focus:border-teal-500"
                  placeholder="BL1 / BL2"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">اسم الطبيب</label>
                <input
                  type="text"
                  value={formData.doctorName}
                  onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">اسم العيادة</label>
                <input
                  type="text"
                  value={formData.clinicName}
                  onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">الملاحظات السريرية والتشخيص</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
                placeholder="سجل تفاصيل الحالة، المواد المستخدمة، وملاحظات المتابعة..."
              />
            </div>

            {/* Version Note */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                ملاحظة حفظ الإصدار (اختياري)
              </label>
              <input
                type="text"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:border-teal-500"
                placeholder="مثال: تم اعتماد درجة البياض BL1 وإضافة شعار العيادة"
              />
            </div>

            {/* Save Button */}
            <div className="pt-3">
              <button
                onClick={handleSave}
                className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 transition-all flex items-center justify-center gap-2"
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 stroke-[3]" />
                    <span>تم حفظ التعديلات بنجاح!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>حفظ بيانات الحالة وإضافة إصدار جديد</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
