import { AchievementModel } from "./achievement";
import { AssessmentAttemptModel } from "./assessment-attempt";
import { AssessmentItemModel } from "./assessment-item";
import { AssessmentTemplateModel } from "./assessment-template";
import { AuditLogModel } from "./audit-log";
import { ClassGroupModel } from "./class-group";
import { ConsentModel } from "./consent";
import { TeacherNoteModel } from "./teacher-note";
import { UserModel } from "./user";
import { VerificationLinkModel } from "./verification-link";
import { WalletEventModel } from "./wallet-event";

export * from "./achievement";
export * from "./assessment-attempt";
export * from "./assessment-item";
export * from "./assessment-template";
export * from "./audit-log";
export * from "./class-group";
export * from "./consent";
export * from "./teacher-note";
export * from "./user";
export * from "./verification-link";
export * from "./wallet-event";

/** Every model, for scripts that act on all collections (indexes, seeding). */
export const allModels = [
  UserModel,
  ClassGroupModel,
  AssessmentTemplateModel,
  AssessmentItemModel,
  AssessmentAttemptModel,
  WalletEventModel,
  AchievementModel,
  VerificationLinkModel,
  ConsentModel,
  TeacherNoteModel,
  AuditLogModel,
] as const;
