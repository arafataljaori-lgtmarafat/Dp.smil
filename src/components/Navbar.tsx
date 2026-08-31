import React, { useState } from "react";
import {
  Plus,
  Building2,
  Download,
  Upload,
  RefreshCw,
  FolderArchive,
  Menu,
  X,
  ChevronLeft
} from "lucide-react";
import { ClinicProfile, PatientCase } from "../types";

interface NavbarProps {
  currentView: "cases" | "studio" | "detail";
  setCurrentView: (view: "cases" | "studio" | "detail") => void;
  activeCase: PatientCase | null;
  clinicProfile: ClinicProfile;
  onOpenClinicSettings: () => void;
  onOpenNewCase: () => void;
  onOpenGitHubExport: () => void;
  onExportBackup: () => void;
  onImportBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onResetSamples: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  activeCase,
  clinicProfile,
  onOpenClinicSettings,
  onOpenNewCase,
  onOpenGitHubExport,
  onExportBackup,
  onImportBackup,
  onResetSamples,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-900 pt-safe">
        <div className="max-w-md md:max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Left: Branding & Back/Menu */}
          <div className="flex items-center gap-2.5">
            {currentView !== "cases" ? (
              <button
                onClick={() => setCurrentView("cases")}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-900 text-slate-300 hover:bg-slate-800 active:scale-95 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-600 to-cyan-500 p-[1.5px] shadow-sm shadow-teal-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                  <span className="text-teal-400 font-extrabold text-sm font-['Plus_Jakarta_Sans']">DP</span>
                </div>
              </div>
            )}

            <div className="flex flex-col">
              <span className="font-bold text-sm text-slate-100 font-['Plus_Jakarta_Sans'] tracking-tight leading-tight">
                {currentView === "cases" ? "DentPilot" : activeCase?.patientName || "تفاصيل الحالة"}
              </span>
              <span className="text-[10px] text-teal-400 font-medium">
                {currentView === "cases" ? "Smile Studio" : activeCase?.patientCode}
              </span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {currentView === "cases" && (
              <button
                onClick={onOpenNewCase}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-teal-500 text-slate-950 shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </button>
            )}

            <button
              onClick={() => setIsMenuOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-900 text-slate-300 hover:bg-slate-800 active:scale-95 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile/Desktop Side Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)} />
          <div className="relative w-72 max-w-[80vw] h-full bg-slate-950 border-l border-slate-800 p-5 flex flex-col pt-safe ms-auto shadow-2xl animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-8">
              <span className="text-sm font-bold text-slate-200">الإعدادات والقائمة</span>
              <button onClick={() => setIsMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-900 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 flex-1 overflow-y-auto">
              <button onClick={() => { onOpenClinicSettings(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors">
                <Building2 className="w-4 h-4 text-teal-400" />
                <span>هوية العيادة</span>
              </button>

              <div className="h-px w-full bg-slate-800/50 my-2" />

              <button onClick={() => { onOpenGitHubExport(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors">
                <FolderArchive className="w-4 h-4 text-cyan-400" />
                <span>تحميل الكود (ZIP)</span>
              </button>

              <button onClick={() => { onExportBackup(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors">
                <Download className="w-4 h-4 text-slate-400" />
                <span>تصدير نسخة احتياطية</span>
              </button>

              <input type="file" ref={fileInputRef} onChange={(e) => { onImportBackup(e); setIsMenuOpen(false); }} accept=".json" className="hidden" />

              <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-900 text-slate-300 text-sm font-medium transition-colors">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>استيراد نسخة احتياطية</span>
              </button>

              <div className="h-px w-full bg-slate-800/50 my-2" />

              <button onClick={() => { onResetSamples(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-950/30 text-rose-400 text-sm font-medium transition-colors">
                <RefreshCw className="w-4 h-4" />
                <span>استعادة حالات العرض</span>
              </button>
            </div>

            <div className="pt-4 border-t border-slate-800 mt-auto">
              <p className="text-[10px] text-slate-500 text-center">DentPilot Smile Studio v2.4</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
