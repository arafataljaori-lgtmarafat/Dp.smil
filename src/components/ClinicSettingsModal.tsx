import React, { useState, useRef } from "react";
import {
  X,
  Building2,
  Save,
  CheckCircle2,
  Instagram,
  Phone,
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
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-slate-800 overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-900 bg-slate-900/50 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center">
              <Building2 className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">هوية العيادة</h2>
              <p className="text-[11px] text-slate-400">تطبيق هوية العيادة على الفيديوهات تلقائياً</p>
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
        <div className="p-5 overflow-y-auto space-y-5 pb-safe">
          {/* Clinic Logo */}
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="w-6 h-6 text-slate-600" />
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <span className="text-sm font-bold text-slate-200 block">شعار العيادة</span>
              <p className="text-[10px] text-slate-500">صيغة PNG بخلفية شفافة هي الأنسب للعلامة المائية</p>
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                className="mt-1 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-400 rounded-lg text-xs font-bold transition-colors"
              >
                {formData.logoUrl ? "تغيير الشعار" : "رفع شعار"}
              </button>
            </div>
          </div>

          {/* Text Fields */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">اسم العيادة</label>
              <input
                type="text"
                value={formData.clinicName}
                onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">اسم الطبيب</label>
              <input
                type="text"
                value={formData.doctorName}
                onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">التخصص الدقيق</label>
              <input
                type="text"
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                placeholder="مثال: استشاري تجميل الأسنان"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Instagram className="w-3.5 h-3.5 text-pink-500" />
                  حساب إنستغرام
                </label>
                <input
                  type="text"
                  value={formData.instagramHandle}
                  onChange={(e) => setFormData({ ...formData, instagramHandle: e.target.value })}
                  placeholder="@dr.smile_clinic"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-teal-500" />
                  رقم التواصل
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+966 50 000 0000"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-3 sticky bottom-0 bg-slate-950 pb-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold border border-slate-800 transition-colors"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              className="flex-[2] py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-sm font-bold shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            >
              {saved ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>تم الحفظ بنجاح</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 stroke-[2.5]" />
                  <span>حفظ هوية العيادة</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
