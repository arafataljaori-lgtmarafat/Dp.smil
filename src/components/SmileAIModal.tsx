import React, { useState } from "react";
import {
  X,
  Sparkles,
  Copy,
  Check,
  Loader2,
  FileText,
  Hash,
  Lightbulb,
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
    <div className="fixed inset-0 z-50 flex justify-center items-end sm:items-center p-0 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-950 w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl border border-purple-500/20 overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-purple-900/30 bg-purple-950/20 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">Smile AI</h2>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 uppercase tracking-wider">
                  Gemini Flash
                </span>
              </div>
              <p className="text-[11px] text-purple-200/60 mt-0.5">المخرج التسويقي الذكي</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900/50 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 pb-safe">
          {!aiData && !isLoading && (
            <div className="text-center py-12 space-y-5 max-w-sm mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                <Sparkles className="w-10 h-10 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">تحليل الحالة السريرية</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  يقوم الذكاء الاصطناعي بتحليل صور ({patientCase.treatmentType}) واستخراج النقاط الجمالية وصياغة هوك قوي وكابشن احترافي.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-500/25 transition-transform active:scale-[0.98]"
              >
                بدء التحليل وصناعة المحتوى
              </button>
            </div>
          )}

          {isLoading && (
            <div className="text-center py-16 space-y-5">
              <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-white mb-1">جاري التحليل بواسطة Gemini...</h3>
                <p className="text-[11px] text-slate-400">نستخرج التناسق اللثوي وتدرج اللون...</p>
              </div>
            </div>
          )}

          {aiData && (
            <div className="space-y-5 animate-in fade-in duration-300">

              {/* 1. Viral Video Hooks */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-purple-400" />
                    عناوين البداية الخاطفة (Hooks)
                  </h3>
                  <button
                    onClick={() => copyToClipboard(aiData.hooks?.join("\n"), "hooks")}
                    className="text-[11px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 active:scale-95 transition-transform"
                  >
                    {copiedHooks ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHooks ? "تم النسخ" : "نسخ"}</span>
                  </button>
                </div>
                <div className="space-y-2">
                  {aiData.hooks?.map((hook: string, i: number) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-slate-200 leading-relaxed pt-0.5">{hook}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Captions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      كابشن الانستقرام (عربي)
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiData.captionAr, "caption")}
                      className="text-[11px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      {copiedCaption ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      نسخ
                    </button>
                  </div>
                  <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                      {aiData.captionAr}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      كابشن تيك توك (Global)
                    </span>
                  </div>
                  <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-3 max-h-48 overflow-y-auto">
                    <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-sans" dir="ltr">
                      {aiData.captionEn}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Clinical Notes & Hashtags */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
                  <span className="text-xs font-bold text-indigo-300 block">توصيات إخراج الفيديو</span>
                  <p className="text-[11px] text-slate-300 leading-relaxed bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-xl">
                    {aiData.transitionTips}
                  </p>
                  {aiData.clinicalHighlights && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {aiData.clinicalHighlights.map((h: string, idx: number) => (
                        <span key={idx} className="bg-slate-950 px-2 py-1 rounded-lg text-[10px] text-slate-300 border border-slate-800">
                          {h}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-teal-400" />
                      هاشتاقات (Trending)
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiData.hashtags?.join(" "), "hashtags")}
                      className="text-[10px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 active:scale-95 transition-transform"
                    >
                      {copiedHashtags ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      نسخ
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {aiData.hashtags?.map((tag: string, idx: number) => (
                      <span key={idx} className="text-[10px] px-2 py-1 rounded-lg bg-slate-950 text-teal-300 border border-slate-800 font-mono">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        {aiData && (
          <div className="pt-4 flex gap-3 sticky bottom-0 bg-slate-950 pb-2 px-5 border-t border-slate-900">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold border border-slate-800 transition-colors"
            >
              إغلاق
            </button>
          </div>
        )}
      </div>
    </div>
  );
};