import React, { useState } from "react";
import {
  X,
  Download,
  FolderArchive,
  Github,
  CheckCircle2,
  Copy,
  ExternalLink,
  Code2,
} from "lucide-react";

interface GitHubExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubExportModal: React.FC<GitHubExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen) return null;

  const handleDownloadZip = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/download-zip");
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dentpilot-smile-studio.zip";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error(err);
      window.open("/api/download-zip", "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  const copyToClipboard = (text: string, stepIndex: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(stepIndex);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  const gitCommands = `git init
git add .
git commit -m "Initial commit: DentPilot Smile Studio"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dentpilot-smile-studio.git
git push -u origin main`;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-teal-500/20 overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-teal-900/30 bg-teal-950/20 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>تصدير لـ GitHub</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30 uppercase tracking-wider">
                  ZIP
                </span>
              </h2>
              <p className="text-[11px] text-teal-200/60 mt-0.5">تنزيل ورفع ملفات السورس كود</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900/50 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 overflow-y-auto pb-safe">
          {/* Main Direct Download Action */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-teal-950/40 to-slate-900 border border-teal-500/20 shadow-lg flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                <Download className="w-4 h-4 text-teal-400" />
                الخطوة 1: تنزيل ملف المشروع (ZIP)
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                يحتوي على كافة ملفات الواجهة والـ Backend (React 18 + Express + Tailwind + Vite)
              </p>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isDownloading}
              className="w-full py-3.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>جارٍ إنشاء الملف...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>تنزيل ملف ZIP الآن</span>
                </>
              )}
            </button>
          </div>

          {/* How to upload to GitHub */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2 px-1">
              <Github className="w-4 h-4 text-white" />
              الخطوة 2: رفع المشروع على GitHub
            </h3>

            {/* Method A: Web Interface Upload */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-300 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 text-[10px] flex items-center justify-center font-bold font-mono">
                    A
                  </span>
                  عبر متصفح GitHub
                </span>
                <a
                  href="https://github.com/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 bg-teal-950/50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  إنشاء مستودع
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <ol className="text-[11px] text-slate-400 space-y-2 list-decimal list-inside leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                <li>
                  فك ضغط ملف <code className="text-teal-300 font-mono text-[10px]">dentpilot.zip</code>
                </li>
                <li>
                  افتح <a href="https://github.com/new" target="_blank" rel="noreferrer" className="text-teal-400 underline">GitHub.com/new</a> وأنشئ مستودع
                </li>
                <li>
                  اسحب جميع الملفات لصفحة المستودع عبر <strong>"uploading an existing file"</strong>
                </li>
              </ol>
            </div>

            {/* Method B: Terminal Git Commands */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 text-[10px] flex items-center justify-center font-bold font-mono">
                    B
                  </span>
                  عبر الطرفية (Terminal)
                </span>
                <button
                  onClick={() => copyToClipboard(gitCommands, 2)}
                  className="text-[10px] font-bold text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded-lg transition-colors active:scale-95"
                >
                  {copiedStep === 2 ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>نسخ الأوامر</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 rounded-xl p-3 font-mono text-[10px] leading-relaxed text-slate-300 border border-slate-800/50 overflow-x-auto text-left dir-ltr">
                <pre className="whitespace-pre">{gitCommands}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-900 flex flex-col sm:flex-row justify-between items-center gap-4 sticky bottom-0 bg-slate-950">
          <div className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 w-full sm:w-auto">
            <Code2 className="w-3.5 h-3.5 text-teal-400" />
            <span>جاهز للتشغيل بأمر <code>npm run dev</code></span>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-800 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
