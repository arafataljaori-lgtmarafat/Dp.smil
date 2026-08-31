import React, { useState, useRef } from "react";
import {
  X,
  Building2,
  Save,
  CheckCircle2,
  Upload,
  Palette,
  ShieldCheck,
  Instagram,
  Phone,
  User,
} from "lucide-react";
import { ClinicProfile } from "../types";

interface ClinicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicProfile: ClinicProfile;
  onSaveProfile: (profile: ClinicProfile) => void;
}

export const ClinicSettingsModal: React.FC<ClinicSettingsModalProps> = ({
  isOpen,
  onClose,
  clinicProfile,
  onSaveProfile,
}) => {
  const [formData, setFormData] = useState<ClinicProfile>(clinicProfile);
  const [saved, setSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setFormData({ ...formData, logoUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSaveProfile(formData);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">إعدادات وهوية العيادة (Branding Profile)</h2>
              <p className="text-xs text-slate-400">تطبيق هوية العيادة وشعارها تلقائياً على كل فيديوهات الحالات</p>
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
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Clinic Logo */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="w-8 h-8 text-slate-600" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-xs font-bold text-white block">شعار العيادة (Logo)</span>
              <p className="text-[11px] text-slate-400">صيغة PNG بخلفية شفافة هي الأنسب للعلامة المائية</p>
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg text-xs font-semibold"
              >
                {formData.logoUrl ? "تغيير الشعار" : "رفع شعار العيادة"}
              </button>
            </div>
          </div>

          {/* Text Fields */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">اسم العيادة أو المركز الطبي</label>
            <input
              type="text"
              value={formData.clinicName}
              onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">اسم الطبيب الرئيسي</label>
            <input
              type="text"
              value={formData.doctorName}
              onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">التخصص الدقيق</label>
            <input
              type="text"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-teal-500"
              placeholder="استشاري تجميل وزراعة الأسنان"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1">
                <Instagram className="w-3.5 h-3.5 text-pink-400" />
                <span>حساب إنستغرام</span>
              </label>
              <input
                type="text"
                value={formData.instagramHandle}
                onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-teal-500"
                placeholder="@dr.smile_clinic"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-teal-400" />
                <span>رقم هاتف / واتساب العيادة</span>
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-teal-500"
                placeholder="+966 50 000 0000"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
          >
            إلغاء
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-lg shadow-teal-500/25 flex items-center gap-2"
          >
            {saved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>تم الحفظ!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>حفظ الهوية</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
