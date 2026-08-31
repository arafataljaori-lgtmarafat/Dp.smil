import React, { useState } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Loader2,
  Share2,
  FileText,
  Hash,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { PatientCase } from "../types";

interface SmileAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientCase: PatientCase;
  onApplyTemplate: (templateId: any) => void;
}

export const SmileAIModal: React.FC<SmileAIModalProps> = ({
  isOpen,
  onClose,
  patientCase,
  onApplyTemplate,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [aiData, setAiData] = useState<any>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedHooks, setCopiedHooks] = useState(false);
  const [copiedHashtags, setCopiedHashtags] = useState(false);

  const beforePhoto = patientCase.photos.find((p) => p.role === "before");
  const afterPhoto = patientCase.photos.find((p) => p.role === "after");

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/ai/analyze-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patientCase.patientName,
          treatmentType: patientCase.treatmentType,
          doctorName: patientCase.doctorName,
          clinicName: patientCase.clinicName,
          shadeBefore: patientCase.shadeBefore,
          shadeAfter: patientCase.shadeAfter,
          notes: patientCase.notes,
          beforeImageBase64: beforePhoto?.url,
          afterImageBase64: afterPhoto?.url,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAiData(data);
      }
    } catch (e) {
      console.warn("AI generation error", e);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "caption" | "hooks" | "hashtags") => {
    navigator.clipboard.writeText(text);
    if (type === "caption") {
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    } else if (type === "hooks") {
      setCopiedHooks(true);
      setTimeout(() => setCopiedHooks(false), 2000);
    } else {
      setCopiedHashtags(true);
      setTimeout(() => setCopiedHashtags(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/40 via-slate-900 to-indigo-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Smile AI • المخرج التسويقي الذكي</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-xs text-slate-400">
                توليد نصوص ريلز وتيك توك الفيروسية والهاشتاقات واقتراح سرعة الانتقال المثالية
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

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!aiData && !isLoading && (
            <div className="text-center py-10 space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white">تحليل الحالة السريرية وصناعة المحتوى</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                يقوم الذكاء الاصطناعي بتحليل صور الحالة ({patientCase.treatmentType}) واستخراج أبرز النقاط الجمالية، مع صياغة هوك قوي للفيديو وكابشن احترافي لمنصات التواصل.
              </p>
              <button
                onClick={handleGenerate}
                className="px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-500/25 transition-all"
              >
                بدء التحليل وصناعة المحتوى الآن
              </button>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-purple-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">جاري تحليل صور الحالة بواسطة Gemini...</h3>
              <p className="text-xs text-slate-400">نستخرج التناسق اللثوي، تدرج اللون، وأفضل طريقة لعرض الانتقال</p>
            </div>
          )}

          {aiData && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 1. Viral Video Hooks */}
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                    <Lightbulb className="w-4 h-4 text-purple-400" />
                    <span>عناوين وجمل البداية الخاطفة (Viral Video Hooks)</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(aiData.hooks?.join("\n"), "hooks")}
                    className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300"
                  >
                    {copiedHooks ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHooks ? "تم النسخ" : "نسخ العناوين"}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {aiData.hooks?.map((hook: string, i: number) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-xs text-white flex items-center gap-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-[10px] font-bold">
                        {i + 1}
                      </span>
                      <span>{hook}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Arabic & English Caption */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Arabic Caption */}
                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>الكابشن العربي (Instagram Reels)</span>
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiData.captionAr, "caption")}
                      className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      {copiedCaption ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>نسخ</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800/60 max-h-48 overflow-y-auto">
                    {aiData.captionAr}
                  </p>
                </div>

                {/* English Caption */}
                <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>الكابشن الإنجليزي (Global / English)</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed bg-slate-900 p-3 rounded-xl border border-slate-800/60 max-h-48 overflow-y-auto font-sans" dir="ltr">
                    {aiData.captionEn}
                  </p>
                </div>
              </div>

              {/* 3. Clinical Highlights & Recommendations */}
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-indigo-300 block">
                  ملاحظات سريرية وتوصيات إخراج الفيديو:
                </span>
                <p className="text-xs text-slate-300 leading-relaxed bg-indigo-950/30 border border-indigo-500/20 p-3 rounded-xl">
                  {aiData.transitionTips}
                </p>
                {aiData.clinicalHighlights && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {aiData.clinicalHighlights.map((h: string, idx: number) => (
                      <div key={idx} className="bg-slate-900 p-2.5 rounded-xl text-[11px] text-slate-300 border border-slate-800">
                        {h}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Hashtags */}
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-teal-400" />
                    <span>الهاشتاقات المقترحة (Trending Dental Hashtags)</span>
                  </span>
                  <button
                    onClick={() => copyToClipboard(aiData.hashtags?.join(" "), "hashtags")}
                    className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1"
                  >
                    {copiedHashtags ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>نسخ كل الهاشتاقات</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {aiData.hashtags?.map((tag: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-[11px] px-2 py-1 rounded-lg bg-slate-900 text-teal-300 border border-slate-800 font-mono"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-between items-center bg-slate-900">
          <span className="text-[11px] text-slate-500">DentPilot Smile Studio AI Suite</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs shadow hover:bg-teal-400"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
