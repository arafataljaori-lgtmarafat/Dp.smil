import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Camera,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { ClinicProfile, PatientCase, PhotoAlignment } from "../types";
import { createDefaultVideoConfig } from "../services/sampleData";
import { createProceduralDentalImage } from "../services/sampleData";

interface NewCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicProfile: ClinicProfile;
  onCreateCase: (newCase: PatientCase) => void;
}

export const NewCaseModal: React.FC<NewCaseModalProps> = ({
  isOpen,
  onClose,
  clinicProfile,
  onCreateCase,
}) => {
  const [patientName, setPatientName] = useState("");
  const [patientCode, setPatientCode] = useState(`DP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [treatmentType, setTreatmentType] = useState("ابتسامة هوليوود");
  const [shadeBefore, setShadeBefore] = useState("A3");
  const [shadeAfter, setShadeAfter] = useState("BL1");
  const [procedureDate, setProcedureDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");

  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);

  const beforeUploadRef = useRef<HTMLInputElement>(null);
  const afterUploadRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (role: "before" | "after", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (role === "before") setBeforeUrl(base64);
      else setAfterUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUseSample = (role: "before" | "after") => {
    const sample = createProceduralDentalImage(role, "discoloration");
    if (role === "before") setBeforeUrl(sample);
    else setAfterUrl(sample);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) return;

    const defaultAlign: PhotoAlignment = { scale: 1.0, rotation: 0, offsetX: 0, offsetY: 0, flipH: false };

    const photos = [];
    if (beforeUrl) {
      photos.push({
        id: `p-b-${Date.now()}`,
        role: "before" as const,
        url: beforeUrl,
        label: "صورة قبل العلاج",
        takenAt: procedureDate,
        alignment: defaultAlign,
      });
    }
    if (afterUrl) {
      photos.push({
        id: `p-a-${Date.now()}`,
        role: "after" as const,
        url: afterUrl,
        label: "صورة بعد العلاج",
        takenAt: procedureDate,
        alignment: defaultAlign,
      });
    }

    const newCase: PatientCase = {
      id: `case-${Date.now()}`,
      patientName: patientName.trim(),
      patientCode: patientCode.trim(),
      doctorName: clinicProfile.doctorName,
      clinicName: clinicProfile.clinicName,
      treatmentType: treatmentType.trim(),
      procedureDate,
      shadeBefore: shadeBefore.trim(),
      shadeAfter: shadeAfter.trim(),
      tags: ["Veneers", "Smile Makeover"],
      notes: notes.trim(),
      photos,
      videoConfig: createDefaultVideoConfig("cinematic-reveal", clinicProfile),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [
        {
          id: `v-init-${Date.now()}`,
          timestamp: new Date().toISOString(),
          author: clinicProfile.doctorName,
          note: "إنشاء الحالة وتعيين الصور الأولية",
          configSnapshot: createDefaultVideoConfig("cinematic-reveal", clinicProfile),
        },
      ],
    };

    onCreateCase(newCase);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-900 bg-slate-900/50 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">إضافة حالة جديدة</h2>
              <p className="text-[11px] text-slate-400">إدخال بيانات المريض والصور السريرية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 pb-safe">

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">اسم المريض</label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="الاسم"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">رمز الحالة (ID)</label>
                <input
                  type="text"
                  value={patientCode}
                  onChange={(e) => setPatientCode(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-teal-400 font-mono focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">نوع الإجراء الطبي</label>
              <input
                type="text"
                value={treatmentType}
                onChange={(e) => setTreatmentType(e.target.value)}
                placeholder="مثال: ابتسامة هوليوود، فينيرز..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>
          </div>

          {/* Photo Upload Boxes */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-300">الصور السريرية للمقارنة</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Before Upload */}
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-2 flex flex-col items-center text-center">
                <span className="text-[11px] font-bold text-slate-400">صورة <span className="text-rose-400">قبل</span></span>
                <div
                  onClick={() => beforeUploadRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-lg bg-slate-950 border border-dashed border-slate-700 hover:border-teal-500 cursor-pointer overflow-hidden flex flex-col items-center justify-center transition-colors group relative"
                >
                  {beforeUrl ? (
                    <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5 text-slate-600 mb-1 group-hover:text-teal-400 transition-colors" />
                      <span className="text-[10px] text-slate-500">اختر صورة</span>
                    </>
                  )}
                  {beforeUrl && (
                    <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] text-white font-bold bg-slate-900/80 px-2 py-1 rounded">تغيير</span>
                    </div>
                  )}
                </div>
                <input type="file" ref={beforeUploadRef} onChange={(e) => handleFileUpload("before", e)} accept="image/*" className="hidden" />
                <button type="button" onClick={() => handleUseSample("before")} className="text-[10px] text-slate-500 hover:text-teal-400 mt-1 transition-colors">
                  أو استخدام نموذج
                </button>
              </div>

              {/* After Upload */}
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 space-y-2 flex flex-col items-center text-center">
                <span className="text-[11px] font-bold text-slate-400">صورة <span className="text-teal-400">بعد</span></span>
                <div
                  onClick={() => afterUploadRef.current?.click()}
                  className="w-full aspect-[4/3] rounded-lg bg-slate-950 border border-dashed border-slate-700 hover:border-teal-500 cursor-pointer overflow-hidden flex flex-col items-center justify-center transition-colors group relative"
                >
                  {afterUrl ? (
                    <img src={afterUrl} alt="After" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5 text-slate-600 mb-1 group-hover:text-teal-400 transition-colors" />
                      <span className="text-[10px] text-slate-500">اختر صورة</span>
                    </>
                  )}
                  {afterUrl && (
                    <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] text-white font-bold bg-slate-900/80 px-2 py-1 rounded">تغيير</span>
                    </div>
                  )}
                </div>
                <input type="file" ref={afterUploadRef} onChange={(e) => handleFileUpload("after", e)} accept="image/*" className="hidden" />
                <button type="button" onClick={() => handleUseSample("after")} className="text-[10px] text-slate-500 hover:text-teal-400 mt-1 transition-colors">
                  أو استخدام نموذج
                </button>
              </div>
            </div>
          </div>

          {/* Shades & Date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 block text-center">اللون قبل</label>
              <input
                type="text"
                value={shadeBefore}
                onChange={(e) => setShadeBefore(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono text-center focus:border-teal-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 block text-center">اللون بعد</label>
              <input
                type="text"
                value={shadeAfter}
                onChange={(e) => setShadeAfter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200 font-mono text-center focus:border-teal-500/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 block text-center">تاريخ الإجراء</label>
              <input
                type="date"
                value={procedureDate}
                onChange={(e) => setProcedureDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-[10px] text-slate-200 text-center focus:border-teal-500/50"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-3 sticky bottom-0 bg-slate-950 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold border border-slate-800 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="flex-[2] py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>متابعة لضبط المحاذاة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
