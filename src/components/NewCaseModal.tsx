import React, { useState, useRef } from "react";
import {
  X,
  Plus,
  Camera,
  Upload,
  Sparkles,
  FileText,
  User,
  CheckCircle2,
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
  const [treatmentType, setTreatmentType] = useState("تجميل الأسنان وعدسات فينيرز (Veneers)");
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">إضافة حالة مريض جديدة</h2>
              <p className="text-xs text-slate-400">إدخال بيانات المريض وتجهيز صور Before & After للفيديو</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[78vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">اسم المريض / الرمز</label>
              <input
                type="text"
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="سارة العتيبي أو Patient #492"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">كود الحالة (Case ID)</label>
              <input
                type="text"
                value={patientCode}
                onChange={(e) => setPatientCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-teal-400 font-mono focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">نوع الإجراء الطبي (Treatment)</label>
            <input
              type="text"
              value={treatmentType}
              onChange={(e) => setTreatmentType(e.target.value)}
              placeholder="مثال: ابتسامة هوليوود 10 عدسات E-Max مع تصحيح الابتسامة اللثوية"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
            />
          </div>

          {/* Photo Upload Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Before Upload */}
            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-rose-400 block">صورة قبل العلاج (BEFORE)</span>
              <div
                onClick={() => beforeUploadRef.current?.click()}
                className="aspect-[4/3] rounded-lg bg-slate-900 border border-dashed border-slate-700 hover:border-teal-500 cursor-pointer overflow-hidden flex items-center justify-center transition-colors"
              >
                {beforeUrl ? (
                  <img src={beforeUrl} alt="Before" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-3 text-slate-500 space-y-1">
                    <Camera className="w-6 h-6 mx-auto stroke-1" />
                    <p className="text-[11px]">انقر لرفع صورة قبل</p>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={beforeUploadRef}
                onChange={(e) => handleFileUpload("before", e)}
                accept="image/*"
                className="hidden"
              />
              <div className="flex justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => beforeUploadRef.current?.click()}
                  className="text-teal-400 hover:underline"
                >
                  رفع ملف
                </button>
                <button
                  type="button"
                  onClick={() => handleUseSample("before")}
                  className="text-slate-400 hover:text-slate-200"
                >
                  نموذج تجريبي
                </button>
              </div>
            </div>

            {/* After Upload */}
            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-emerald-400 block">صورة بعد العلاج (AFTER)</span>
              <div
                onClick={() => afterUploadRef.current?.click()}
                className="aspect-[4/3] rounded-lg bg-slate-900 border border-dashed border-slate-700 hover:border-teal-500 cursor-pointer overflow-hidden flex items-center justify-center transition-colors"
              >
                {afterUrl ? (
                  <img src={afterUrl} alt="After" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-3 text-slate-500 space-y-1">
                    <Camera className="w-6 h-6 mx-auto stroke-1" />
                    <p className="text-[11px]">انقر لرفع صورة بعد</p>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={afterUploadRef}
                onChange={(e) => handleFileUpload("after", e)}
                accept="image/*"
                className="hidden"
              />
              <div className="flex justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => afterUploadRef.current?.click()}
                  className="text-teal-400 hover:underline"
                >
                  رفع ملف
                </button>
                <button
                  type="button"
                  onClick={() => handleUseSample("after")}
                  className="text-slate-400 hover:text-slate-200"
                >
                  نموذج تجريبي
                </button>
              </div>
            </div>
          </div>

          {/* Shades & Date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">اللون قبل</label>
              <input
                type="text"
                value={shadeBefore}
                onChange={(e) => setShadeBefore(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">اللون بعد</label>
              <input
                type="text"
                value={shadeAfter}
                onChange={(e) => setShadeAfter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-center"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">تاريخ الإجراء</label>
              <input
                type="date"
                value={procedureDate}
                onChange={(e) => setProcedureDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 flex items-center gap-2"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>إنشاء الحالة وبدء الاستوديو</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
