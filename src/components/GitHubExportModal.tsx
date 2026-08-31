import React, { useState } from "react";
import {
  X,
  Download,
  FolderArchive,
  Github,
  Terminal,
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>تحميل كود المشروع ورفعه إلى GitHub</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Full Source Code ZIP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                تنزيل كامل ملفات المشروع بصيغة ZIP ثم رفعها يدوياً لمستودع GitHub
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Main Direct Download Action */}
          <div className="p-5 rounded-xl bg-gradient-to-br from-teal-950/50 via-slate-900 to-slate-900 border border-teal-500/30 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-teal-400" />
                  <span>الخطوة 1: تنزيل ملف المشروع المضغوط (ZIP)</span>
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  يحتوي على كافة ملفات الواجهة والـ Backend (React 18 + Express + Tailwind + Vite)
                </p>
              </div>

              <button
                onClick={handleDownloadZip}
                disabled={isDownloading}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
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
          </div>

          {/* How to upload to GitHub */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Github className="w-4 h-4 text-white" />
              <span>الخطوة 2: رفع المشروع على GitHub (طريقتان)</span>
            </h3>

            {/* Method A: Web Interface Upload */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 text-[10px] flex items-center justify-center font-mono">
                    A
                  </span>
                  الطريقة السهلة (مباشرة عبر متصفح GitHub)
                </span>
                <a
                  href="https://github.com/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-teal-400 hover:underline flex items-center gap-1"
                >
                  <span>إنشاء مستودع جديد</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside pr-1 leading-relaxed">
                <li>
                  فك ضغط ملف <code className="bg-slate-800 text-teal-300 px-1.5 py-0.5 rounded text-[11px]">dentpilot-smile-studio.zip</code> على سطح المكتب.
                </li>
                <li>
                  افتح موقع <a href="https://github.com/new" target="_blank" rel="noreferrer" className="text-teal-400 underline">GitHub.com/new</a> وأنشئ مستودعاً جديداً (New Repository).
                </li>
                <li>
                  في صفحة المستودع، اختر <strong>"uploading an existing file"</strong> واسحب جميع الملفات المفرودة ثم اضغط <strong>Commit changes</strong>.
                </li>
              </ol>
            </div>

            {/* Method B: Terminal Git Commands */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center font-mono">
                    B
                  </span>
                  عبر الطرفية وأوامر Git (Terminal)
                </span>
                <button
                  onClick={() => copyToClipboard(gitCommands, 2)}
                  className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                >
                  {copiedStep === 2 ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">تم النسخ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>نسخ الأوامر</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-900 rounded-lg p-3 font-mono text-[11px] text-slate-300 border border-slate-800 overflow-x-auto text-left dir-ltr">
                <pre className="whitespace-pre">{gitCommands}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 flex justify-between items-center bg-slate-900">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Code2 className="w-3.5 h-3.5 text-teal-400" />
            <span>جاهز للتشغيل بأمر <code>npm install && npm run dev</code></span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
