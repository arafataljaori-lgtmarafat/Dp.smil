import React from "react";
import {
  Sparkles,
  Plus,
  Layers,
  Building2,
  ShieldCheck,
  Download,
  Upload,
  RefreshCw,
  Video,
  Github,
  FolderArchive,
} from "lucide-react";
import { ClinicProfile, PatientCase } from "../types";

interface NavbarProps {
  currentView: "cases" | "studio" | "detail";
  setCurrentView: (view: "cases" | "studio" | "detail") => void;
  activeCase: PatientCase | null;
  clinicProfile: ClinicProfile;
  onOpenClinicSettings: () => void;
  onOpenNewCase: () => void;
  onOpenSmileAI: () => void;
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
  onOpenSmileAI,
  onOpenGitHubExport,
  onExportBackup,
  onImportBackup,
  onResetSamples,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div
            id="brand-logo-btn"
            onClick={() => setCurrentView("cases")}
            className="cursor-pointer flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 via-teal-500 to-cyan-400 p-0.5 shadow-lg shadow-teal-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <span className="text-teal-400 font-extrabold text-xl font-['Plus_Jakarta_Sans']">DP</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white font-['Plus_Jakarta_Sans'] tracking-tight">
                  DentPilot
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/25 font-bold">
                  Smile Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">استوديو فيديو حالات الأسنان الاحترافي</p>
            </div>
          </div>

          {/* Active Case Breadcrumb */}
          {activeCase && (
            <div className="hidden md:flex items-center gap-2 mr-4 pr-4 border-r border-slate-700/60">
              <span className="text-xs text-slate-400">الحالة النشطة:</span>
              <button
                id="active-case-chip"
                onClick={() => setCurrentView("detail")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-teal-300 border border-teal-500/30 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="truncate max-w-[140px]">{activeCase.patientName}</span>
                <span className="text-[10px] text-slate-400">({activeCase.patientCode})</span>
              </button>
            </div>
          )}
        </div>

        {/* Center Navigation Tabs */}
        <nav className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800/80">
          <button
            id="nav-cases-tab"
            onClick={() => setCurrentView("cases")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              currentView === "cases"
                ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>الحالات السريرية</span>
          </button>

          <button
            id="nav-studio-tab"
            disabled={!activeCase}
            onClick={() => setCurrentView("studio")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !activeCase
                ? "opacity-40 cursor-not-allowed text-slate-500"
                : currentView === "studio"
                ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            <Video className="w-4 h-4" />
            <span>استوديو الفيديو</span>
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Smile AI Smart Assistant */}
          <button
            id="btn-open-smile-ai"
            onClick={onOpenSmileAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-900/60 to-indigo-900/60 hover:from-purple-800 hover:to-indigo-800 text-purple-200 border border-purple-500/30 text-xs font-bold shadow-sm transition-all"
            title="مساعد الذكاء الاصطناعي لكتابة النصوص والتسويق"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" style={{ animationDuration: "6s" }} />
            <span className="hidden sm:inline">Smile AI</span>
          </button>

          {/* GitHub / Full Project ZIP Download Button */}
          <button
            id="btn-open-github-export"
            onClick={onOpenGitHubExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold shadow-sm transition-all"
            title="تنزيل كامل ملفات المشروع كملف ZIP ورفعه إلى GitHub"
          >
            <FolderArchive className="w-4 h-4 text-teal-400" />
            <span className="hidden md:inline">تحميل كود المشروع (ZIP)</span>
          </button>

          {/* New Patient Case Button */}
          <button
            id="btn-new-case"
            onClick={onOpenNewCase}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold shadow-md shadow-teal-500/25 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">حالة جديدة</span>
          </button>

          {/* Clinic Branding Profile */}
          <button
            id="btn-clinic-settings"
            onClick={onOpenClinicSettings}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title={`إعدادات وهوية العيادة: ${clinicProfile.clinicName}`}
          >
            <Building2 className="w-4 h-4" />
          </button>

          {/* Data Backup / Privacy Menu Dropdown or buttons */}
          <div className="hidden lg:flex items-center gap-1 border-r border-slate-800 pr-2 mr-1">
            <button
              id="btn-export-backup"
              onClick={onExportBackup}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="تصدير نسخة احتياطية من جميع الحالات (JSON)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={onImportBackup}
              accept=".json"
              className="hidden"
            />
            <button
              id="btn-import-backup"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="استيراد نسخة احتياطية"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-reset-samples"
              onClick={onResetSamples}
              className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
              title="إعادة تعيين نماذج الحالات السريرية الافتراضية"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
