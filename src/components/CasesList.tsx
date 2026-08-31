import React, { useState } from "react";
import {
  Plus,
  Search,
  Filter,
  Play,
  Sliders,
  Sparkles,
  Calendar,
  User,
  Trash2,
  Copy,
  ChevronLeft,
  Video,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { PatientCase } from "../types";

interface CasesListProps {
  cases: PatientCase[];
  onSelectCase: (patientCase: PatientCase) => void;
  onOpenStudio: (patientCase: PatientCase) => void;
  onOpenNewCase: () => void;
  onDeleteCase: (id: string) => void;
  onDuplicateCase: (patientCase: PatientCase) => void;
}

export const CasesList: React.FC<CasesListProps> = ({
  cases,
  onSelectCase,
  onOpenStudio,
  onOpenNewCase,
  onDeleteCase,
  onDuplicateCase,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  // All tags
  const allTags = ["all", "Veneers", "Smile Makeover", "Diastema", "Composite Bonding", "Chipped Tooth", "تجميل الأسنان"];

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.patientCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.treatmentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.doctorName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTag =
      selectedTag === "all" ||
      c.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase());

    return matchesSearch && matchesTag;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Hero Banner with Statistics */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/40 p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Glow background */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-bold border border-teal-500/20">
                DentPilot Smile Studio v2.4
              </span>
              <span className="text-xs text-slate-400">منصة فيديو الحالات السريرية</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              حوّل صور حالات الابتسامة إلى فيديوهات اجتماعية مذهلة
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              محرك فيديو حتمي ودقيق يحافظ على التشريح السريري الطبيعي للأسنان بدون تشويه، مع قوالب Reels وTikTok ومحاذاة خط الوسط وشريط التقدم.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-hero-new-case"
              onClick={onOpenNewCase}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm shadow-xl shadow-teal-500/25 transition-all active:scale-95"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>إضافة حالة مريض جديدة</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
            <span className="text-[11px] text-slate-400 block">إجمالي الحالات السريرية</span>
            <span className="text-xl font-bold text-white font-mono">{cases.length}</span>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
            <span className="text-[11px] text-slate-400 block">قوالب الفيديو الجاهزة</span>
            <span className="text-xl font-bold text-teal-400 font-mono">8 قوالب</span>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
            <span className="text-[11px] text-slate-400 block">مقاسات السوشيال ميديا</span>
            <span className="text-xl font-bold text-cyan-400 font-mono">9:16 / 4:5 / 1:1</span>
          </div>
          <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
            <span className="text-[11px] text-slate-400 block">محرك الفيديو</span>
            <span className="text-xl font-bold text-emerald-400">Deterministic 60fps</span>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-cases-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم المريض، كود الحالة، أو نوع الإجراء..."
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl pr-10 pl-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>

        {/* Tag Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedTag === tag
                  ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {tag === "all" ? "جميع الحالات" : tag}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Cards Grid */}
      {filteredCases.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">لم يتم العثور على أي حالة مطابقة</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            جرّب تغيير كلمات البحث أو أضف حالة سريرية جديدة مع صور Before & After للبدء.
          </p>
          <button
            onClick={onOpenNewCase}
            className="px-4 py-2 rounded-xl bg-teal-500 text-slate-950 font-bold text-xs shadow"
          >
            إضافة حالة جديدة الآن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCases.map((patientCase) => {
            const beforePhoto = patientCase.photos.find((p) => p.role === "before");
            const afterPhoto = patientCase.photos.find((p) => p.role === "after");

            return (
              <div
                key={patientCase.id}
                id={`case-card-${patientCase.id}`}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col group"
              >
                {/* Visual Before / After Split Preview Thumbnail */}
                <div
                  onClick={() => onOpenStudio(patientCase)}
                  className="relative aspect-[16/10] bg-slate-950 cursor-pointer overflow-hidden border-b border-slate-800"
                >
                  <div className="grid grid-cols-2 w-full h-full">
                    {/* Before Half */}
                    <div className="relative border-l border-slate-800/80 overflow-hidden bg-slate-900 flex items-center justify-center">
                      {beforePhoto?.url ? (
                        <img
                          src={beforePhoto.url}
                          alt="Before"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-500">لا توجد صورة قبل</span>
                      )}
                      <span className="absolute top-2 right-2 bg-rose-900/80 backdrop-blur-sm text-rose-200 text-[9px] font-bold px-1.5 py-0.5 rounded border border-rose-500/30">
                        قبل
                      </span>
                    </div>

                    {/* After Half */}
                    <div className="relative overflow-hidden bg-slate-900 flex items-center justify-center">
                      {afterPhoto?.url ? (
                        <img
                          src={afterPhoto.url}
                          alt="After"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-500">لا توجد صورة بعد</span>
                      )}
                      <span className="absolute top-2 left-2 bg-emerald-900/80 backdrop-blur-sm text-emerald-200 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                        بعد
                      </span>
                    </div>
                  </div>

                  {/* Center Play Overlay on Hover */}
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button className="px-3.5 py-2 rounded-xl bg-teal-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg">
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>فتح الاستوديو</span>
                    </button>
                  </div>

                  {/* Template Badge on Card */}
                  <div className="absolute bottom-2 right-2 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-teal-300 border border-slate-800 font-mono">
                    {patientCase.videoConfig.templateId}
                  </div>
                </div>

                {/* Case Info Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-mono text-teal-400 font-bold">
                        {patientCase.patientCode}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{patientCase.procedureDate}</span>
                      </span>
                    </div>

                    <h2
                      onClick={() => onSelectCase(patientCase)}
                      className="text-sm font-bold text-white hover:text-teal-300 transition-colors cursor-pointer line-clamp-1"
                    >
                      {patientCase.patientName}
                    </h2>

                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                      {patientCase.treatmentType}
                    </p>
                  </div>

                  {/* Shades & Doctor info */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <span className="text-rose-400 font-semibold">{patientCase.shadeBefore}</span>
                      <span className="text-slate-500">➔</span>
                      <span className="text-emerald-400 font-semibold">{patientCase.shadeAfter}</span>
                    </div>
                    <span className="text-slate-400 truncate max-w-[120px]">
                      د. {patientCase.doctorName}
                    </span>
                  </div>

                  {/* Card Bottom Action Buttons */}
                  <div className="pt-2 flex items-center justify-between gap-2">
                    <button
                      id={`btn-open-studio-${patientCase.id}`}
                      onClick={() => onOpenStudio(patientCase)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-slate-950 border border-teal-500/20 text-xs font-bold transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>استوديو الفيديو</span>
                    </button>

                    <button
                      id={`btn-case-details-${patientCase.id}`}
                      onClick={() => onSelectCase(patientCase)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="تفاصيل الحالة وتعديل الصور"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDuplicateCase(patientCase)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="تكرار الحالة"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`هل أنت متأكد من حذف حالة المريض: ${patientCase.patientName}؟`)) {
                          onDeleteCase(patientCase.id);
                        }
                      }}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition-colors"
                      title="حذف الحالة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
