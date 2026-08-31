import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { CasesList } from "./components/CasesList";
import { CaseDetailView } from "./components/CaseDetailView";
import { VideoStudio } from "./components/VideoStudio";
import { AlignmentStudio } from "./components/AlignmentStudio";
import { SmileAIModal } from "./components/SmileAIModal";
import { ExportModal } from "./components/ExportModal";
import { ClinicSettingsModal } from "./components/ClinicSettingsModal";
import { NewCaseModal } from "./components/NewCaseModal";
import { GitHubExportModal } from "./components/GitHubExportModal";
import { ClinicProfile, PatientCase, PhotoAlignment, VideoProjectConfig } from "./types";
import { storageService } from "./services/storage";
import { INITIAL_SAMPLE_CASES, INITIAL_CLINIC_PROFILE } from "./services/sampleData";

export default function App() {
  const [currentView, setCurrentView] = useState<"cases" | "studio" | "detail">("cases");
  const [cases, setCases] = useState<PatientCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [clinicProfile, setClinicProfile] = useState<ClinicProfile>(INITIAL_CLINIC_PROFILE);

  // Modals state
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [isClinicSettingsOpen, setIsClinicSettingsOpen] = useState(false);
  const [isSmileAIOpen, setIsSmileAIOpen] = useState(false);
  const [isAlignmentStudioOpen, setIsAlignmentStudioOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGitHubExportOpen, setIsGitHubExportOpen] = useState(false);

  // Load initial cases and clinic profile from storage
  useEffect(() => {
    const loadedCases = storageService.getCases();
    if (loadedCases.length === 0) {
      storageService.saveCases(INITIAL_SAMPLE_CASES);
      setCases(INITIAL_SAMPLE_CASES);
      setActiveCaseId(INITIAL_SAMPLE_CASES[0]?.id || null);
    } else {
      setCases(loadedCases);
      setActiveCaseId(loadedCases[0]?.id || null);
    }

    const loadedProfile = storageService.getClinicProfile();
    setClinicProfile(loadedProfile);
  }, []);

  const activeCase = cases.find((c) => c.id === activeCaseId) || cases[0] || null;

  // Handlers
  const handleSelectCase = (patientCase: PatientCase) => {
    setActiveCaseId(patientCase.id);
    setCurrentView("detail");
  };

  const handleOpenStudio = (patientCase: PatientCase) => {
    setActiveCaseId(patientCase.id);
    setCurrentView("studio");
  };

  const handleCreateCase = (newCase: PatientCase) => {
    const updated = [newCase, ...cases];
    setCases(updated);
    storageService.saveCases(updated);
    setActiveCaseId(newCase.id);
    setCurrentView("studio");
  };

  const handleUpdateCase = (updatedCase: PatientCase, versionNote?: string) => {
    const updatedWithVersion: PatientCase = {
      ...updatedCase,
      updatedAt: new Date().toISOString(),
      versions: [
        ...(updatedCase.versions || []),
        {
          id: `v-${Date.now()}`,
          timestamp: new Date().toISOString(),
          author: clinicProfile.doctorName,
          note: versionNote || "تحديث إعدادات الحالة",
          configSnapshot: updatedCase.videoConfig,
        },
      ],
    };

    const updatedList = cases.map((c) => (c.id === updatedCase.id ? updatedWithVersion : c));
    setCases(updatedList);
    storageService.saveCases(updatedList);
  };

  const handleUpdateCaseConfig = (newConfig: VideoProjectConfig, note?: string) => {
    if (!activeCase) return;
    const updatedCase: PatientCase = {
      ...activeCase,
      videoConfig: newConfig,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCase(updatedCase, note || "تعديل إعدادات الفيديو");
  };

  const handleDeleteCase = (id: string) => {
    const filtered = cases.filter((c) => c.id !== id);
    setCases(filtered);
    storageService.saveCases(filtered);
    if (activeCaseId === id) {
      setActiveCaseId(filtered[0]?.id || null);
      if (filtered.length === 0) {
        setCurrentView("cases");
      }
    }
  };

  const handleDuplicateCase = (patientCase: PatientCase) => {
    const duplicated: PatientCase = {
      ...patientCase,
      id: `case-${Date.now()}`,
      patientName: `${patientCase.patientName} (نسخة)`,
      patientCode: `DP-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [duplicated, ...cases];
    setCases(updated);
    storageService.saveCases(updated);
    setActiveCaseId(duplicated.id);
  };

  const handleSaveAlignment = (beforeAlign: PhotoAlignment, afterAlign: PhotoAlignment) => {
    if (!activeCase) return;
    const updatedPhotos = activeCase.photos.map((p) => {
      if (p.role === "before") return { ...p, alignment: beforeAlign };
      if (p.role === "after") return { ...p, alignment: afterAlign };
      return p;
    });

    const updatedCase = {
      ...activeCase,
      photos: updatedPhotos,
    };
    handleUpdateCase(updatedCase, "تحديث محاذاة الطبقات السريرية");
  };

  const handleSaveClinicProfile = (newProfile: ClinicProfile) => {
    setClinicProfile(newProfile);
    storageService.saveClinicProfile(newProfile);
  };

  const handleExportBackup = () => {
    const data = {
      clinicProfile,
      cases,
      exportedAt: new Date().toISOString(),
      version: "2.4",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `DentPilot-SmileStudio-Backup-${new Date().toISOString().split("T")[0]}.json`;
    link.href = url;
    link.click();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.cases && Array.isArray(parsed.cases)) {
          setCases(parsed.cases);
          storageService.saveCases(parsed.cases);
          if (parsed.cases[0]) setActiveCaseId(parsed.cases[0].id);
        }
        if (parsed.clinicProfile) {
          setClinicProfile(parsed.clinicProfile);
          storageService.saveClinicProfile(parsed.clinicProfile);
        }
        alert("تم استيراد النسخة الاحتياطية بنجاح!");
      } catch (err) {
        alert("ملف النسخة الاحتياطية غير صالح.");
      }
    };
    reader.readAsText(file);
  };

  const handleResetSamples = () => {
    if (confirm("هل ترغب في استعادة الحالات السريرية النموذجية الافتراضية؟")) {
      storageService.saveCases(INITIAL_SAMPLE_CASES);
      setCases(INITIAL_SAMPLE_CASES);
      setActiveCaseId(INITIAL_SAMPLE_CASES[0]?.id || null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo'] selection:bg-teal-500 selection:text-slate-950">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        activeCase={activeCase}
        clinicProfile={clinicProfile}
        onOpenClinicSettings={() => setIsClinicSettingsOpen(true)}
        onOpenNewCase={() => setIsNewCaseOpen(true)}
        onOpenSmileAI={() => setIsSmileAIOpen(true)}
        onOpenGitHubExport={() => setIsGitHubExportOpen(true)}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onResetSamples={handleResetSamples}
      />

      {/* Main Content Router */}
      <main className="flex-1">
        {currentView === "cases" && (
          <CasesList
            cases={cases}
            onSelectCase={handleSelectCase}
            onOpenStudio={handleOpenStudio}
            onOpenNewCase={() => setIsNewCaseOpen(true)}
            onDeleteCase={handleDeleteCase}
            onDuplicateCase={handleDuplicateCase}
          />
        )}

        {currentView === "detail" && activeCase && (
          <CaseDetailView
            patientCase={activeCase}
            onSaveCase={handleUpdateCase}
            onOpenStudio={handleOpenStudio}
            onOpenAlignmentStudio={() => setIsAlignmentStudioOpen(true)}
            onOpenSmileAI={() => setIsSmileAIOpen(true)}
            onBack={() => setCurrentView("cases")}
          />
        )}

        {currentView === "studio" && activeCase && (
          <VideoStudio
            patientCase={activeCase}
            onUpdateCaseConfig={handleUpdateCaseConfig}
            onOpenAlignmentStudio={() => setIsAlignmentStudioOpen(true)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            onOpenSmileAI={() => setIsSmileAIOpen(true)}
            onBackToCases={() => setCurrentView("cases")}
          />
        )}
      </main>

      {/* Modals */}
      <NewCaseModal
        isOpen={isNewCaseOpen}
        onClose={() => setIsNewCaseOpen(false)}
        clinicProfile={clinicProfile}
        onCreateCase={handleCreateCase}
      />

      <ClinicSettingsModal
        isOpen={isClinicSettingsOpen}
        onClose={() => setIsClinicSettingsOpen(false)}
        clinicProfile={clinicProfile}
        onSaveProfile={handleSaveClinicProfile}
      />

      <GitHubExportModal
        isOpen={isGitHubExportOpen}
        onClose={() => setIsGitHubExportOpen(false)}
      />

      {activeCase && (
        <>
          <AlignmentStudio
            isOpen={isAlignmentStudioOpen}
            onClose={() => setIsAlignmentStudioOpen(false)}
            beforePhoto={activeCase.photos.find((p) => p.role === "before") || null}
            afterPhoto={activeCase.photos.find((p) => p.role === "after") || null}
            onSaveAlignment={handleSaveAlignment}
          />

          <SmileAIModal
            isOpen={isSmileAIOpen}
            onClose={() => setIsSmileAIOpen(false)}
            patientCase={activeCase}
            onApplyTemplate={(templateId) =>
              handleUpdateCaseConfig({ ...activeCase.videoConfig, templateId })
            }
          />

          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            patientCase={activeCase}
          />
        </>
      )}
    </div>
  );
}
