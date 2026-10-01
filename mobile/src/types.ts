export type Role = 'STUDENT' | 'PARENT' | 'FACULTY' | 'HOD' | 'DEAN' | 'ADMIN';
export interface User { id: string; name: string; email: string; role: Role; branch: string | null }

export interface SubjectAttendance { subject: string; total: number; present: number; percentage: number }
export interface Attendance { total: number; present: number; percentage: number; level: 0 | 1 | 2 | 3; belowThreshold: boolean; subjects: SubjectAttendance[] }

export interface Notification { id: string; kind: string; title: string; body: string; read: boolean; createdAt: string }
export interface Notifications { unread: number; items: Notification[] }

export interface StageLog { id: string; stageIndex: number; stageRole: string; action: 'APPROVED' | 'REJECTED' | 'ESCALATED' | null; comment: string | null }
export interface Application {
  id: string; type: string; reason: string; status: 'PENDING' | 'IN_PROGRESS' | 'APPROVED' | 'REJECTED'; currentStage: number; urgent: boolean; createdAt: string;
  stageLogs: StageLog[]; submittedBy: { id: string; name: string; branch: string | null };
}

export interface Fee { id: string; description: string; amount: number; status: 'DUE' | 'PAID'; dueDate: string; dueInDays: number; overdueDays: number; receiptNo: string | null; extensionRequested: boolean }
export interface Appointment { id: string; slot: string; mode: 'ONLINE' | 'IN_PERSON'; status: 'REQUESTED' | 'CONFIRMED' | 'DECLINED'; note: string | null; parent: { name: string }; staff: { name: string; role: string }; student: { name: string } }
export interface Staff { id: string; name: string; role: string; branch: string | null }
export interface Child { id: string; name: string; branch: string | null; semester: number; attendance: Attendance; risk: { level: 'LOW' | 'MEDIUM' | 'HIGH'; percentage: number; warnings: string[] } }
export interface Announcement { id: string; title: string; body: string; type: string; createdAt: string }
export interface VaultItem { id: string; title: string; subject: string; fileUrl: string; uploadedBy: { name: string } }
export interface StudentProfileResponse { name: string; branch: string | null; studentProfile: { semester: number; cgpa: number | null; hostelRoom: string | null; busRoute: string | null; targetRole: string | null } }

// ---- AI engine payloads (snake_case, passed through by the backend) ----
export interface ResourceLink { title: string; url: string; why: string }
export interface EventTip { name: string; type: string; why_relevant: string; how_to_join: string; url: string | null }
export interface Coaching { motivation: string; next_steps: string[]; events: EventTip[]; resources: ResourceLink[] }
export interface ChatResponse {
  session_id: string; answer: string; mode: string; confidence: number; suggested_questions: string[]; coaching: Coaching | null;
  self_check: { verdict: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED'; supported_ratio: number } | null;
  sources: { source: string }[];
}
export interface CareerAdvice {
  matched_role: string; role_readiness_pct: number; stage: string; daily_nudge: string; resume_recommendations: string[]; placement_eligibility: string[];
  skill_gaps: { skill: string; priority: string; reason: string; suggested_action: string }[];
  events: { name: string; type: string; why_relevant: string; how_to_join: string | null; url: string | null }[];
}
export interface StudyPlan {
  summary: string;
  timetable: { day: number; date: string; focus: string; total_minutes: number; sessions: { subject: string; topic: string; activity: string; minutes: number }[] }[];
  pyqs: { id: string; subject: string; topic: string; question: string; year: number; marks: number }[];
}
export interface AtRisk { studentId: string; name: string; branch: string | null; attendance: number; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; riskPercentage: number; warnings: string[]; source: string }
export interface SubjectRef { id: string; name: string; branch: string; semester: number }
