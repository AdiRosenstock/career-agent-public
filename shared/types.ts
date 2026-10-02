export type RoleFamily = 'product' | 'data' | 'finance' | 'consulting' | 'software' | 'engineering' | 'mechanical' | 'marketing' | 'sales' | 'design' | 'operations' | 'other';
export type SponsorshipStatus = 'explicit_yes' | 'history_only' | 'unknown' | 'explicit_no';
export type JobStatus = 'open' | 'closed' | 'unknown';
export interface Fact { id: string; label: string; value: string; source: string; confirmed: boolean }
export interface CandidateDocument {
 id: string; kind: 'transcript' | 'recommendation'; label: string; filename: string;
 path: string; originalPath: string; sha256: string; addedAt: string; documentDate: string | null; notes: string;
}
export interface CandidateProfile {
 name: string; email: string; phone: string; linkedin: string; github: string; graduation: string;
 facts: Fact[]; visaStatus: string; anticipatedOPT: boolean;
 authorizationNow: boolean | null; authorizationAtStart: boolean | null; futureSponsorship: boolean | null;
 usCitizen?: boolean | null; exportControlEligible?: boolean | null; clearanceEligible?: boolean | null;
 authorizationConfirmedAt: string | null; earliestStart: string | null; salaryPreference: string | null;
 savedAnswers: { id: string; question: string; answer: string; confirmedAt: string }[];
 resume: { path: string; sha256: string; originalPath: string; filename: string };
 documents?: CandidateDocument[];
}
export interface SponsorshipEvidence {
 id: string; status: SponsorshipStatus; sourceUrl: string; excerpt: string; checkedAt: string;
 employerName: string; scope: 'role' | 'employer'; entityMatch: boolean;
}
export interface FormQuestion { id: string; label: string; required: boolean; type: string; options?: string[] }
export interface Job {
 id: string; source: 'greenhouse' | 'lever' | 'ashby' | 'manual'; board: string; postingId: string;
 company: string; title: string; location: string; description: string; sourceUrl: string; applyUrl: string;
 fetchedAt: string; postedAt: string | null; deadline: string | null; status: JobStatus;
 roleFamily: RoleFamily; sponsorship: SponsorshipEvidence[];
 score: number; fitReasons: string[]; concerns: string[]; eligible: boolean; eligibilityReasons: string[];
 questions: FormQuestion[]; formInspectedAt: string | null; formVersion: string | null;
 dismissed: boolean;
}
export interface Answer { questionId: string; question: string; answer: string; factIds: string[]; confirmed: boolean }
export interface PacketAttachment { questionId: string; documentId: string; sha256: string }
export type PacketStatus = 'draft' | 'needs_input' | 'ready' | 'approved' | 'submitting' | 'submitted' | 'failed' | 'unknown' | 'handoff';
export interface ApplicationPacket {
 id: string; jobId: string; createdAt: string; updatedAt: string; version: number; status: PacketStatus;
 resumeHash: string; formVersion: string | null; answers: Answer[]; coverLetter: string;
 unresolved: string[]; notes: string; contentHash: string; approvalId: string | null;
 attachments?: PacketAttachment[];
}
export interface Approval { id: string; batchId: string; packetId: string; packetHash: string; resumeHash: string; formVersion: string; approvedAt: string; revokedAt: string | null }
export interface SubmissionAttempt {
 id: string; packetId: string; jobId: string; batchId: string; startedAt: string; finishedAt: string | null;
 outcome: 'in_progress' | 'submitted' | 'failed' | 'unknown' | 'handoff'; evidence: string; confirmationUrl: string | null;
}
export interface DailyRun { id: string; day: string; startedAt: string; finishedAt: string | null; status: 'running' | 'complete' | 'partial' | 'failed'; discovered: number; prepared: number; errors: string[] }
export interface ManualPreparationAllowance { id: string; day: string; limit: number; reason: string; authorizedAt: string }
export interface Board { id: string; company: string; source: 'greenhouse' | 'lever' | 'ashby'; token: string; enabled: boolean; sponsorship: SponsorshipEvidence[] }
export type CareerStage = 'new_grad' | 'early_career' | 'experienced';
export interface Settings { careerStage?: CareerStage; yearsExperience?: number | null; careerTargetsConfirmed?: boolean; preferredLocations?: string[]; workplacePreference?: 'any' | 'remote' | 'hybrid' | 'onsite'; dailyLimit: number; timezone: string; scheduleTime: string; rolePriority: RoleFamily[]; roleKeywords?: string[]; backend: 'sqlite' | 'supabase'; automationId: string | null; minimumAnnualCompensation?: number | null; compensationBasis?: 'base' | 'total' }
export interface PriorApplication {
 id: string; company: string; title: string; jobUrl: string | null; postingId: string | null;
 source: 'email' | 'linkedin' | 'handshake' | 'user'; sourceRef: string; evidence: string;
 appliedAt: string | null; checkedAt: string; matchScope?: 'exact_role' | 'needs_review'; supersedesId?: string;
}
export interface CompensationAssessment {
 min: number | null; max: number | null; currency: string; basis: 'base' | 'total' | 'unknown';
 period: 'year' | 'hour' | 'unknown'; excerpt: string; sourceUrl: string; checkedAt: string;
 status: 'meets' | 'below' | 'overlap' | 'unknown';
}
export interface AppState {
 schemaVersion: 1; profile: CandidateProfile; jobs: Job[]; packets: ApplicationPacket[]; approvals: Approval[];
 attempts: SubmissionAttempt[]; runs: DailyRun[]; boards: Board[]; settings: Settings;
 preparationLedger: { packetId: string; jobId: string; day: string; manualAllowanceId?: string }[];
 manualPreparationAllowances?: ManualPreparationAllowance[];
 priorApplications?: PriorApplication[];
}
export interface AppSnapshot extends AppState { meta: { appliedJobIds?: string[]; backend: string; preparedToday: number; remainingToday: number; manualLimitToday?: number; manualRemainingToday?: number; lastSuccessfulRun: string | null; catchUpDue: boolean; resumeValid: boolean; workspace: string; salaryAssessments?: Record<string, CompensationAssessment> } }
export interface PacketDraft { answers?: Answer[]; coverLetter?: string; unresolved?: string[]; notes?: string; attachments?: PacketAttachment[] }
