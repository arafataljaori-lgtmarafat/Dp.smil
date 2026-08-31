import React, { useState, useRef } from "react";
import {
  Video,
  Sliders,
  Sparkles,
  Camera,
  Save,
  History,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { CasePhoto, PatientCase, PhotoAlignment } from "../types";
import { createProceduralDentalImage } from "../services/sampleData";

interface CaseDetailViewProps {
  patientCase: PatientCase;
  onSaveCase: (updatedCase: PatientCase, versionNote?: string) => void;
  onOpenStudio: (patientCase: PatientCase) => void;
  onOpenAlignmentStudio: () => void;
  onOpenSmileAI: () => void;
  onBack: () => void; // Unused now, back is handled in Navbar
}

export const CaseDetailView: React.FC<CaseDetailViewProps> = ({
  patientCase,
  onSaveCase,
  onOpenStudio,
  onOpenAlignmentStudio,
  onOpenSmileAI,
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
    <div className="max-w-md md:max-w-5xl mx-auto px-4 py-6 space-y-6 pb-32">

      {/* Primary Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onOpenStudio(formData)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/25 transition-transform active:scale-95"
        >
          <Video className="w-4 h-4 stroke-[2.5]" />
          <span>استوديو الفيديو</span>
        </button>
        <button
          onClick={onOpenSmileAI}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-purple-900/20 text-purple-400 text-sm font-bold transition-transform active:scale-95"
        >
          <Sparkles className="w-4 h-4" />
          <span>Smile AI</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Photos Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Camera className="w-4 h-4 text-teal-400" />
              <span>الصور السريرية</span>
            </h2>
            {beforePhoto && afterPhoto && (
              <button
                onClick={onOpenAlignmentStudio}
                className="flex items-center gap-1.5 text-[11px] font-bold text-teal-400 bg-teal-500/10 px-2.5 py-1.5 rounded-lg border border-teal-500/20 active:scale-95 transition-transform"
              >
                <Sliders className="w-3.5 h-3.5" />
                محاذاة تشريحية
              </button>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 grid grid-cols-2 gap-3">
            {/* Before Photo Card */}
            <div className="space-y-2 flex flex-col items-center">
              <span className="text-[11px] font-bold text-slate-400">صورة <span className="text-rose-400">قبل</span></span>
              <div
                onClick={() => beforeUploadRef.current?.click()}
                className="w-full aspect-[4/3] rounded-xl bg-slate-950 border border-dashed border-slate-700 cursor-pointer overflow-hidden flex flex-col items-center justify-center relative group"
              >
                {beforePhoto?.url ? (
                  <img src={beforePhoto.url} alt="Before" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5 text-slate-600 mb-1" />
                    <span className="text-[10px] text-slate-500">اختر صورة</span>
                  </>
                )}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[10px] text-white font-bold bg-slate-900/80 px-2 py-1 rounded">تغيير</span>
                </div>
              </div>
              <input type="file" ref={beforeUploadRef} onChange={(e) => handlePhotoUpload("before", e)} accept="image/*" className="hidden" />
              <button onClick={() => handleUseSamplePhoto("before", "discoloration")} className="text-[10px] text-slate-500 hover:text-teal-400 transition-colors">
                أو استخدام نموذج
              </button>
            </div>

            {/* After Photo Card */}
            <div className="space-y-2 flex flex-col items-center">
              <span className="text-[11px] font-bold text-slate-400">صورة <span className="text-teal-400">بعد</span></span>
              <div
                onClick={() => afterUploadRef.current?.click()}
                className="w-full aspect-[4/3] rounded-xl bg-slate-950 border border-dashed border-slate-700 cursor-pointer overflow-hidden flex flex-col items-center justify-center relative group"
              >
                {afterPhoto?.url ? (
                  <img src={afterPhoto.url} alt="After" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-5 h-5 text-slate-600 mb-1" />
                    <span className="text-[10px] text-slate-500">اختر صورة</span>
                  </>
                )}
                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[10px] text-white font-bold bg-slate-900/80 px-2 py-1 rounded">تغيير</span>
                </div>
              </div>
              <input type="file" ref={afterUploadRef} onChange={(e) => handlePhotoUpload("after", e)} accept="image/*" className="hidden" />
              <button onClick={() => handleUseSamplePhoto("after", "discoloration")} className="text-[10px] text-slate-500 hover:text-teal-400 transition-colors">
                أو استخدام نموذج
              </button>
            </div>
          </div>

          {/* Versions History Log Card */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              سجل التعديلات
            </h3>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden">
              {formData.versions && formData.versions.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {formData.versions.map((ver, idx) => (
                    <div key={ver.id || idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 flex justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-300">{ver.note || "تحديث"}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{new Date(ver.timestamp).toLocaleString("ar-SA")}</p>
                      </div>
                      <span className="text-[10px] self-start px-1.5 py-0.5 rounded bg-slate-800 text-teal-400 font-mono">
                        {ver.configSnapshot?.templateId || "v1"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-4">لا توجد إصدارات</p>
              )}
            </div>
          </div>
        </div>

        {/* Details Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-400" />
            بيانات المريض
          </h3>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">اسم المريض</label>
                <input
                  type="text"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">كود الحالة</label>
                <input
                  type="text"
                  value={formData.patientCode}
                  onChange={(e) => setFormData({ ...formData, patientCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-teal-400 font-mono focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">نوع الإجراء الطبي</label>
              <input
                type="text"
                value={formData.treatmentType}
                onChange={(e) => setFormData({ ...formData, treatmentType: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block text-center">اللون قبل</label>
                <input
                  type="text"
                  value={formData.shadeBefore}
                  onChange={(e) => setFormData({ ...formData, shadeBefore: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono text-center focus:border-teal-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block text-center">اللون بعد</label>
                <input
                  type="text"
                  value={formData.shadeAfter}
                  onChange={(e) => setFormData({ ...formData, shadeAfter: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono text-center focus:border-teal-500/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block text-center">التاريخ</label>
                <input
                  type="date"
                  value={formData.procedureDate}
                  onChange={(e) => setFormData({ ...formData, procedureDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[10px] text-slate-200 text-center focus:border-teal-500/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">ملاحظات سريرية</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400">ملاحظة التعديل (اختياري)</label>
              <input
                type="text"
                value={versionNote}
                onChange={(e) => setVersionNote(e.target.value)}
                placeholder="مثال: تحديث الصور"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3 mt-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold border border-slate-700 transition-all flex items-center justify-center gap-2"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  <span className="text-teal-400">تم الحفظ</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  حفظ البيانات
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
