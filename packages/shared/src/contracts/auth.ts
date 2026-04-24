import { z } from "zod";
import { roleTypes } from "../domain/workflow";

const isoDateTimeStringSchema = z.string().datetime({ offset: true });

export const sessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  roles: z.array(z.enum(roleTypes)).min(1),
  departmentId: z.string().min(1).nullable().optional(),
  departmentCode: z.string().min(1).nullable().optional(),
  departmentName: z.string().min(1).nullable().optional(),
  managerUserId: z.string().min(1).nullable().optional(),
  source: z.enum(["mock", "app", "supabase"]),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionWorkspaceSchema = z.object({
  canCreateCase: z.boolean(),
  canViewApprovals: z.boolean(),
  canViewFinanceReview: z.boolean(),
  canViewAdmin: z.boolean(),
});
export type SessionWorkspace = z.infer<typeof sessionWorkspaceSchema>;

export const authSessionResponseSchema = z.object({
  user: sessionUserSchema,
  workspace: sessionWorkspaceSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const demoLoginRequestSchema = z.object({
  userId: z.string().min(1),
});
export type DemoLoginRequest = z.infer<typeof demoLoginRequestSchema>;

export const authTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: sessionUserSchema,
});
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

export const directoryUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  roles: z.array(z.enum(roleTypes)).min(1),
  departmentId: z.string().min(1).nullable().optional(),
  departmentCode: z.string().min(1).nullable().optional(),
  departmentName: z.string().min(1).nullable().optional(),
  managerUserId: z.string().min(1).nullable().optional(),
  isActive: z.boolean(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type DirectoryUser = z.infer<typeof directoryUserSchema>;

export const directoryUserListResponseSchema = z.array(directoryUserSchema);
export type DirectoryUserListResponse = z.infer<typeof directoryUserListResponseSchema>;

export const directoryDepartmentSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});
export type DirectoryDepartment = z.infer<typeof directoryDepartmentSchema>;

export const directoryDepartmentListResponseSchema = z.array(directoryDepartmentSchema);
export type DirectoryDepartmentListResponse = z.infer<typeof directoryDepartmentListResponseSchema>;
