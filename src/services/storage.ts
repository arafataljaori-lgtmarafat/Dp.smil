import { ClinicProfile, PatientCase, VideoProjectConfig } from "../types";
import { DEFAULT_VIDEO_CONFIG, SAMPLE_CASES } from "./sampleData";

const CASES_STORAGE_KEY = "dentpilot_cases_v1";
const CLINIC_PROFILE_KEY = "dentpilot_clinic_profile_v1";

export const DEFAULT_CLINIC_PROFILE: ClinicProfile = {
  id: "clinic-default",
  clinicName: "Elite Smile Dental Art",
  doctorName: "أحمد المنصور",
  specialty: "استشاري طب وتجميل الأسنان وزراعة الأسنان",
  phone: "+966 50 123 4567",
  instagram: "@elitesmile.sa",
  tiktok: "@elitesmile.sa",
  logoUrl: null,
  defaultAccentColor: "#14b8a6",
  defaultBadgeStyle: "clinical-teal",
};

class StorageService {
  public getCases(): PatientCase[] {
    try {
      const data = localStorage.getItem(CASES_STORAGE_KEY);
      if (!data) {
        this.saveCases(SAMPLE_CASES);
        return SAMPLE_CASES;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error("Failed to load cases from storage", e);
      return SAMPLE_CASES;
    }
  }

  public saveCases(cases: PatientCase[]): void {
    try {
      localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(cases));
    } catch (e) {
      console.error("Failed to save cases to storage", e);
    }
  }

  public getCaseById(id: string): PatientCase | undefined {
    const cases = this.getCases();
    return cases.find((c) => c.id === id);
  }

  public upsertCase(patientCase: PatientCase, versionNote?: string): PatientCase {
    const cases = this.getCases();
    const existingIndex = cases.findIndex((c) => c.id === patientCase.id);
    const now = new Date().toISOString();

    const updatedCase: PatientCase = {
      ...patientCase,
      updatedAt: now,
    };

    if (versionNote) {
      updatedCase.versions = [
        ...(updatedCase.versions || []),
        {
          id: `v-${Date.now()}`,
          timestamp: now,
          note: versionNote,
          author: patientCase.doctorName || "Dentist",
          configSnapshot: JSON.parse(JSON.stringify(patientCase.videoConfig)),
        },
      ];
    }

    if (existingIndex >= 0) {
      cases[existingIndex] = updatedCase;
    } else {
      cases.unshift(updatedCase);
    }

    this.saveCases(cases);
    return updatedCase;
  }

  public deleteCase(id: string): boolean {
    const cases = this.getCases();
    const filtered = cases.filter((c) => c.id !== id);
    if (filtered.length !== cases.length) {
      this.saveCases(filtered);
      return true;
    }
    return false;
  }

  public createNewCase(initial?: Partial<PatientCase>): PatientCase {
    const clinic = this.getClinicProfile();
    const count = this.getCases().length + 1;
    const newCase: PatientCase = {
      id: `case-${Date.now()}`,
      patientCode: `DP-${new Date().getFullYear()}-${String(count).padStart(3, "0")}`,
      patientName: initial?.patientName || "مريض جديد (New Patient)",
      treatmentType: initial?.treatmentType || "تصميم ابتسامة هوليوود (Smile Makeover)",
      procedureDate: new Date().toISOString().split("T")[0],
      shadeBefore: "A3",
      shadeAfter: "BL1",
      doctorName: clinic.doctorName,
      clinicName: clinic.clinicName,
      notes: "",
      tags: ["Smile Makeover", "تجميل الأسنان"],
      photos: [],
      videoConfig: {
        ...DEFAULT_VIDEO_CONFIG,
        branding: {
          ...DEFAULT_VIDEO_CONFIG.branding,
          clinicName: clinic.clinicName,
          doctorName: clinic.doctorName,
          accentColor: clinic.defaultAccentColor,
          logoUrl: clinic.logoUrl,
        },
      },
      versions: [
        {
          id: `v-${Date.now()}`,
          timestamp: new Date().toISOString(),
          note: "تم إنشاء الحالة وتجهيز الإعدادات",
          author: clinic.doctorName,
          configSnapshot: DEFAULT_VIDEO_CONFIG,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...initial,
    };

    return this.upsertCase(newCase);
  }

  public updateCaseVideoConfig(caseId: string, config: VideoProjectConfig, versionNote?: string): PatientCase | null {
    const targetCase = this.getCaseById(caseId);
    if (!targetCase) return null;
    targetCase.videoConfig = config;
    return this.upsertCase(targetCase, versionNote);
  }

  public getClinicProfile(): ClinicProfile {
    try {
      const data = localStorage.getItem(CLINIC_PROFILE_KEY);
      if (!data) {
        this.saveClinicProfile(DEFAULT_CLINIC_PROFILE);
        return DEFAULT_CLINIC_PROFILE;
      }
      return JSON.parse(data);
    } catch {
      return DEFAULT_CLINIC_PROFILE;
    }
  }

  public saveClinicProfile(profile: ClinicProfile): void {
    try {
      localStorage.setItem(CLINIC_PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.error("Failed to save clinic profile", e);
    }
  }

  public exportClinicBackupJSON(): string {
    const backup = {
      app: "DentPilot Smile Studio",
      exportedAt: new Date().toISOString(),
      profile: this.getClinicProfile(),
      cases: this.getCases(),
    };
    return JSON.stringify(backup, null, 2);
  }

  public importClinicBackupJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.cases && Array.isArray(parsed.cases)) {
        this.saveCases(parsed.cases);
      }
      if (parsed.profile) {
        this.saveClinicProfile(parsed.profile);
      }
      return true;
    } catch (e) {
      console.error("Failed to import clinic backup", e);
      return false;
    }
  }

  public resetToSampleCases(): void {
    this.saveCases(SAMPLE_CASES);
    this.saveClinicProfile(DEFAULT_CLINIC_PROFILE);
  }
}

export const storageService = new StorageService();
