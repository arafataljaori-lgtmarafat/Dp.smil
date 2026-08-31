import React, { useState } from "react";
import {
  Plus,
  Search,
  Sliders,
  Calendar,
  Trash2,
  Copy,
  Video,
  Layers,
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
    <div className="max-w-md md:max-w-5xl mx-auto px-4 py-6 space-y-5 pb-24">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">سجل الحالات</h1>
          <p className="text-xs text-slate-400 mt-1">{cases.length} حالة مسجلة</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-cases-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث باسم المريض أو الكود..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-all"
          />
        </div>

        {/* Tag Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedTag === tag
                  ? "bg-teal-500 text-slate-950"
                  : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tag === "all" ? "الكل" : tag}
            </button>
          ))}
        </div>
      </div>

      {/* Cases Cards List */}
      {filteredCases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 mb-2">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">لا توجد حالات</h3>
          <p className="text-xs text-slate-500 max-w-[240px]">
            لم يتم العثور على أي حالة مطابقة للبحث. أضف حالة جديدة للبدء.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCases.map((patientCase) => {
            const beforePhoto = patientCase.photos.find((p) => p.role === "before");
            const afterPhoto = patientCase.photos.find((p) => p.role === "after");

            return (
              <div
                key={patientCase.id}
                id={`case-card-${patientCase.id}`}
                className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex flex-col active:scale-[0.99] transition-transform"
              >
                {/* Visual Before / After Split Preview Thumbnail */}
                <div
                  onClick={() => onOpenStudio(patientCase)}
                  className="relative aspect-video bg-slate-950 cursor-pointer overflow-hidden border-b border-slate-800"
                >
                  <div className="grid grid-cols-2 w-full h-full">
                    {/* Before Half */}
                    <div className="relative border-l border-slate-800 flex items-center justify-center">
                      {beforePhoto?.url ? (
                        <img
                          src={beforePhoto.url}
                          alt="Before"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600">قبل</span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
                      <span className="absolute bottom-2 right-2 text-slate-300 text-[10px] font-medium z-10 drop-shadow-md">
                        قبل
                      </span>
                    </div>

                    {/* After Half */}
                    <div className="relative flex items-center justify-center">
                      {afterPhoto?.url ? (
                        <img
                          src={afterPhoto.url}
                          alt="After"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-slate-600">بعد</span>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" />
                      <span className="absolute bottom-2 left-2 text-teal-300 text-[10px] font-medium z-10 drop-shadow-md">
                        بعد
                      </span>
                    </div>
                  </div>
                </div>

                {/* Case Info Body */}
                <div className="p-3.5 flex flex-col flex-1 space-y-3">
                  <div onClick={() => onSelectCase(patientCase)} className="cursor-pointer">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[10px] font-mono text-teal-500 font-medium bg-teal-500/10 px-1.5 py-0.5 rounded">
                        {patientCase.patientCode}
                      </span>
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {patientCase.procedureDate}
                      </span>
                    </div>

                    <h2 className="text-sm font-bold text-slate-100 line-clamp-1 mt-1.5">
                      {patientCase.patientName}
                    </h2>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                      {patientCase.treatmentType}
                    </p>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2 mt-auto">
                    <button
                      onClick={() => onOpenStudio(patientCase)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500/10 text-teal-400 text-xs font-bold hover:bg-teal-500 hover:text-slate-950 transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" />
                      استوديو الفيديو
                    </button>

                    <button
                      onClick={() => onSelectCase(patientCase)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
                      title="إعدادات الحالة"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDuplicateCase(patientCase)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
                      title="نسخ الحالة"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        if (confirm(`حذف الحالة: ${patientCase.patientName}؟`)) {
                          onDeleteCase(patientCase.id);
                        }
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:bg-rose-900/40 hover:text-rose-400 transition-colors"
                      title="حذف"
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

      {/* Floating Action Button (Mobile) */}
      <div className="fixed bottom-6 left-6 z-30 sm:hidden">
        <button
          onClick={onOpenNewCase}
          className="w-14 h-14 bg-teal-500 text-slate-950 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};
