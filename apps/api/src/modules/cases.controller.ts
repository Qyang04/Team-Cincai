import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  approvalAnalyticsSummarySchema,
  approvalSlaSweepResponseSchema,
  financeReviewAnalyticsSummarySchema,
  createCaseSchema,
  submitCaseSchema,
  type ApprovalActionResponse,
  type ApprovalAnalyticsSummary,
  type ApprovalSlaSweepResponse,
  type CaseStatus,
  type ExportActionResponse,
  type FinanceReviewActionResponse,
  type FinanceReviewAnalyticsSummary,
  type QuestionResponseActionResponse,
  type RecoverActionResponse,
  type WorkflowType,
} from "@finance-ops/shared";
import { ApprovalsService } from "./approvals.service";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { AuthorizationService } from "./authorization.service";
import { CaseDetailService } from "./case-detail.service";
import { CasesService } from "./cases.service";
import {
  answerQuestionSchema,
  approvalDecisionSchema,
  attachArtifactsSchema,
  completeArtifactUploadSchema,
  delegateApprovalSchema,
  financeDecisionSchema,
  financeAssignSchema,
  prepareUploadSchema,
  processArtifactSchema,
  requestInfoSchema,
} from "./dto";
import { ExportsService } from "./exports.service";
import { FinanceReviewService } from "./finance-review.service";
import { IntakeService } from "./intake.service";
import { PolicyService } from "./policy.service";
import { CurrentUser } from "./current-user.decorator";
import type { AuthenticatedUser } from "./auth.types";
import { Roles } from "./roles.decorator";
import { LocalArtifactStorageService } from "./local-artifact-storage.service";
import { StorageService } from "./storage.service";
import { WorkflowOrchestratorService } from "./workflow-orchestrator.service";
import { WorkflowService } from "./workflow.service";

function createErrorActionResponse<TResponse extends { success: boolean }>(error: string): TResponse {
  return {
    success: false,
    error,
  } as unknown as TResponse;
}

function toCaseStatusSnapshot(input: { id: string; status: CaseStatus }) {
  return {
    id: input.id,
    status: input.status,
  };
}

function toExportRecordSnapshot(input: {
  id: string;
  caseId: string;
  status: string;
  connectorName?: string | null;
  errorMessage?: string | null;
}) {
  return {
    id: input.id,
    caseId: input.caseId,
    status: input.status,
    connectorName: input.connectorName ?? undefined,
    errorMessage: input.errorMessage ?? null,
  };
}

function toFinanceReviewResolution(input: {
  id: string;
  caseId: string;
  reviewerId?: string | null;
  ownerId?: string | null;
  outcome?: string | null;
  reasonCategory?: string | null;
  codingDecision?: string | null;
  reconciliationStatus?: string | null;
  reconciledAmount?: number | null;
  reconciledCurrency?: string | null;
  annotation?: string | null;
  note?: string | null;
}) {
  return {
    id: input.id,
    caseId: input.caseId,
    reviewerId: input.reviewerId ?? null,
    ownerId: input.ownerId ?? null,
    outcome: input.outcome ?? null,
    reasonCategory: input.reasonCategory ?? null,
    codingDecision: input.codingDecision ?? null,
    reconciliationStatus: input.reconciliationStatus ?? null,
    reconciledAmount: input.reconciledAmount ?? null,
    reconciledCurrency: input.reconciledCurrency ?? null,
    annotation: input.annotation ?? null,
    note: input.note ?? null,
  };
}

function guessContentTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
  };
  return map[ext] ?? "application/octet-stream";
}

@Controller("cases")
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly workflowService: WorkflowService,
    private readonly artifactsService: ArtifactsService,
    private readonly auditService: AuditService,
    private readonly intakeService: IntakeService,
    private readonly caseDetailService: CaseDetailService,
    private readonly policyService: PolicyService,
    private readonly approvalsService: ApprovalsService,
    private readonly financeReviewService: FinanceReviewService,
    private readonly exportsService: ExportsService,
    private readonly authorizationService: AuthorizationService,
    private readonly storageService: StorageService,
    private readonly localArtifactStorage: LocalArtifactStorageService,
    private readonly workflowOrchestrator: WorkflowOrchestratorService,
  ) {}

  @Get()
  listCases(@CurrentUser() user: AuthenticatedUser) {
    return this.casesService.listCases(user);
  }

  @Get(":id")
  async getCase(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.caseDetailService.getCaseDetail(id);
  }

  @Post()
  createCase(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      workflowType: WorkflowType;
    },
  ) {
    const input = createCaseSchema.parse({
      workflowType: body.workflowType,
      requesterId: user.id,
    });
    return this.casesService.createCase(input);
  }

  @Post(":id/submit")
  async submitCase(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      notes?: string;
      filenames?: string[];
    },
  ) {
    const caseRecord = await this.casesService.getCase(id);
    if (!caseRecord) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecord.requesterId !== user.id && !user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Only the requester or an admin can submit this case.");
    }
    const input = submitCaseSchema.parse(body);
    const result = await this.workflowOrchestrator.submitDraftCase(id, input);
    if (result && typeof result === "object" && "error" in result) {
      throw new BadRequestException(String((result as { error: string }).error));
    }
    return result;
  }

  @Get(":id/artifacts")
  async getArtifacts(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.artifactsService.listForCase(id);
  }

  @Get(":id/artifacts/:artifactId/file")
  async getArtifactFile(
    @Param("id") caseId: string,
    @Param("artifactId") artifactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.authorizationService.canViewCase(user, caseId))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    const artifact = await this.artifactsService.getArtifact(artifactId);
    if (!artifact || artifact.caseId !== caseId) {
      throw new NotFoundException("Artifact not found");
    }

    const uri = artifact.storageUri;
    if (!uri || !uri.startsWith("local://")) {
      throw new NotFoundException(
        "This artifact has no on-disk file (mock filename-only or remote storage). It cannot be previewed here.",
      );
    }

    const absolutePath = this.localArtifactStorage.resolveLocalPath(uri);
    if (!absolutePath) {
      throw new NotFoundException("Storage path is invalid");
    }

    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        throw new NotFoundException("Artifact is not a file");
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("File is missing on the server");
      }
      throw error;
    }

    const stream = createReadStream(absolutePath);
    const contentType = artifact.mimeType?.trim() || guessContentTypeFromFilename(artifact.filename);

    return new StreamableFile(stream, {
      type: contentType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
    });
  }

  @Post(":id/artifacts/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadArtifactFile(
    @Param("id") id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing file body (multipart field name must be "file").');
    }

    const caseRecord = await this.casesService.getCase(id);
    if (!caseRecord) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecord.status !== "DRAFT") {
      throw new BadRequestException("Artifacts can only be uploaded while the case is in DRAFT.");
    }
    if (caseRecord.requesterId !== user.id) {
      throw new ForbiddenException("Only the requester can upload artifacts for this case.");
    }

    const originalName = file.originalname || "upload.bin";
    const { storageUri } = await this.localArtifactStorage.saveUploadedFile(id, originalName, file.buffer);

    const created = await this.artifactsService.createUploadedPlaceholder(id, {
      filename: originalName,
      mimeType: file.mimetype,
      storageUri,
    });

    const outcome = await this.workflowOrchestrator.processArtifactUpload(id, created.id, storageUri);
    if (outcome && typeof outcome === "object" && "error" in outcome) {
      throw new BadRequestException(String((outcome as { error: string }).error));
    }

    return { artifact: outcome };
  }

  @Post(":id/artifacts/upload-url")
  async prepareArtifactUpload(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      filename: string;
      mimeType?: string;
    },
  ) {
    const caseRecord = await this.casesService.getCase(id);
    const input = prepareUploadSchema.parse(body);
    if (!caseRecord) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecord.status !== "DRAFT") {
      throw new BadRequestException("Artifacts can only be prepared while the case is in DRAFT.");
    }
    if (caseRecord.requesterId !== user.id && !user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Only the requester or an admin can prepare uploads for this case.");
    }
    return this.storageService.prepareUpload({
      caseId: id,
      filename: input.filename,
      mimeType: input.mimeType,
    });
  }

  @Post(":id/artifacts")
  async attachArtifacts(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      filenames: string[];
      mimeType?: string;
    },
  ) {
    const caseRecord = await this.casesService.getCase(id);
    if (!caseRecord) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecord.status !== "DRAFT") {
      throw new BadRequestException("Artifacts can only be attached while the case is in DRAFT.");
    }
    if (caseRecord.requesterId !== user.id && !user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Only the requester or an admin can attach artifacts for this case.");
    }
    const input = attachArtifactsSchema.parse(body);
    return this.artifactsService.attachMany(id, input.filenames, {
      mimeType: input.mimeType,
      storagePrefix: "mock://artifacts",
      processingStatus: "PREPARED",
    });
  }

  @Post(":id/artifacts/:artifactId/complete")
  async completeArtifactUpload(
    @Param("id") id: string,
    @Param("artifactId") artifactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      storageUri?: string;
    },
  ) {
    const caseRecord = await this.casesService.getCase(id);
    if (!caseRecord) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecord.requesterId !== user.id && !user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Only the requester or an admin can complete artifact uploads for this case.");
    }
    const input = completeArtifactUploadSchema.parse(body);
    return this.workflowOrchestrator.processArtifactUpload(id, artifactId, input.storageUri);
  }

  @Post(":id/artifacts/process")
  async processArtifact(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      artifactId: string;
    },
  ) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    const input = processArtifactSchema.parse(body);
    return this.workflowOrchestrator.processArtifactUpload(id, input.artifactId);
  }

  @Get(":id/questions")
  async getQuestions(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.intakeService.listQuestions(id);
  }

  @Post(":id/questions/:questionId/respond")
  async answerQuestion(
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      answer: string;
    },
  ): Promise<QuestionResponseActionResponse> {
    const caseRecordBeforeAnswer = await this.casesService.getCase(id);
    if (!caseRecordBeforeAnswer) {
      throw new NotFoundException("Case not found");
    }
    if (caseRecordBeforeAnswer.requesterId !== user.id && !user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Only the requester or an admin can answer these questions.");
    }
    const input = answerQuestionSchema.parse(body);
    const answered = await this.intakeService.answerQuestion(id, questionId, input.answer);
    const caseRecord = await this.casesService.getCase(id);
    const allQuestionsAnswered = caseRecord?.openQuestions.every(
      (question: { status: string }) => question.status === "ANSWERED",
    );

    await this.auditService.recordEvent({
      caseId: id,
      eventType: "QUESTION_ANSWERED",
      actorType: "REQUESTER",
      actorId: user.id,
      payload: {
        questionId,
        answer: input.answer,
      },
    });

    if (
      caseRecord &&
      caseRecord.status === "AWAITING_REQUESTER_INFO" &&
      allQuestionsAnswered
    ) {
      await this.workflowService.transitionCase({
        caseId: id,
        from: "AWAITING_REQUESTER_INFO",
        to: "POLICY_REVIEW",
        actorType: "REQUESTER",
        actorId: caseRecord.requesterId,
        note: "Requester completed outstanding clarification questions.",
        assignedTo: caseRecord.requesterId,
      });

      await this.workflowOrchestrator.runPolicyAndRoute(id);
    }

    if (
      caseRecord &&
      caseRecord.status === "AWAITING_APPROVER_INFO_RESPONSE" &&
      allQuestionsAnswered
    ) {
      const approvalTask = await this.approvalsService.getLatestInfoRequestedTask(id);

      if (!approvalTask) {
        await this.auditService.recordEvent({
          caseId: id,
          eventType: "APPROVAL_REENTRY_FAILED",
          actorType: "SYSTEM",
          payload: {
            questionId,
            currentStatus: caseRecord.status,
          },
        });

        throw new Error("Approval task awaiting requester response not found");
      }

      await this.approvalsService.reopenTask(approvalTask.id);
      await this.workflowService.transitionCase({
        caseId: id,
        from: "AWAITING_APPROVER_INFO_RESPONSE",
        to: "AWAITING_APPROVAL",
        actorType: "REQUESTER",
        actorId: caseRecord.requesterId,
        note: "Requester answered approver follow-up questions.",
        assignedTo: approvalTask.approverId,
      });
    }

    return {
      success: true,
      data: {
        question: {
          id: answered.id,
          caseId: answered.caseId,
          question: answered.question,
          answer: answered.answer ?? null,
          status: answered.status,
          source: answered.source ?? undefined,
        },
      },
    };
  }

  @Get(":id/transitions")
  async getTransitions(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.casesService.getTransitions(id);
  }

  @Get(":id/audit-events")
  async getAuditEvents(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.auditService.listForCase(id);
  }

  @Post(":id/policy-review/run")
  async runPolicyReview(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.workflowOrchestrator.runPolicyAndRoute(id);
  }

  @Get(":id/policy-result")
  async getLatestPolicyResult(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.policyService.getLatestPolicyResult(id);
  }

  @Get("/approvals/tasks")
  @Roles("APPROVER", "ADMIN")
  listApprovalTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.approvalsService.listPendingTasks(user.id, user.roles.includes("ADMIN"));
  }

  @Get("/approvals/analytics")
  @Roles("APPROVER", "ADMIN")
  async getApprovalAnalytics(): Promise<ApprovalAnalyticsSummary> {
    return approvalAnalyticsSummarySchema.parse(await this.approvalsService.getApprovalAnalytics());
  }

  @Post("/approvals/sla-sweep")
  @Roles("ADMIN")
  async runApprovalSlaSweep(): Promise<ApprovalSlaSweepResponse> {
    return approvalSlaSweepResponseSchema.parse(await this.approvalsService.runSlaBreachSweep());
  }

  @Post("/approvals/:taskId/approve")
  @Roles("APPROVER", "ADMIN")
  async approveTask(
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { decisionReason?: string },
  ): Promise<ApprovalActionResponse> {
    const input = approvalDecisionSchema.parse({
      approverId: user.id,
      decisionReason: body.decisionReason,
    });
    const task = await this.approvalsService.getTask(taskId);
    if (!task) {
      return createErrorActionResponse<ApprovalActionResponse>("Approval task not found");
    }
    if (!(await this.authorizationService.canManageApprovalTask(user, taskId))) {
      return createErrorActionResponse<ApprovalActionResponse>("Only the assigned approver or an admin can approve");
    }

    await this.approvalsService.markApproved(taskId, input.decisionReason, input.approverId);
    const stageStatus = await this.approvalsService.getStageStatus(task.caseId, task.stageNumber ?? 1);

    if (stageStatus === "PENDING") {
      const currentCase = await this.casesService.getCase(task.caseId);
      return {
        success: true,
        data: {
          case: toCaseStatusSnapshot({
            id: task.caseId,
            status: (currentCase?.status ?? "AWAITING_APPROVAL") as CaseStatus,
          }),
          exportRecord: null,
        },
      };
    }

    const activated = await this.approvalsService.activateNextStage(task.caseId, task.stageNumber ?? 1);
    if (activated.activated) {
      const currentCase = await this.casesService.getCase(task.caseId);
      return {
        success: true,
        data: {
          case: toCaseStatusSnapshot({
            id: task.caseId,
            status: (currentCase?.status ?? "AWAITING_APPROVAL") as CaseStatus,
          }),
          exportRecord: null,
        },
      };
    }

    await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "APPROVED",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.decisionReason ?? "Final matrix stage approved by approver.",
      assignedTo: null,
    });
    const exportReadyCase = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "APPROVED",
      to: "EXPORT_READY",
      actorType: "SYSTEM",
      note: "Case marked ready for export after matrix completion.",
      assignedTo: null,
    });
    const exportRecord = await this.exportsService.ensureExportReady(task.caseId);

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(exportReadyCase),
        exportRecord: exportRecord ? toExportRecordSnapshot(exportRecord) : null,
      },
    };
  }

  @Post("/approvals/:taskId/reject")
  @Roles("APPROVER", "ADMIN")
  async rejectTask(
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { decisionReason?: string },
  ): Promise<ApprovalActionResponse> {
    const input = approvalDecisionSchema.parse({
      approverId: user.id,
      decisionReason: body.decisionReason,
    });
    const task = await this.approvalsService.getTask(taskId);
    if (!task) {
      return createErrorActionResponse<ApprovalActionResponse>("Approval task not found");
    }
    if (!(await this.authorizationService.canManageApprovalTask(user, taskId))) {
      return createErrorActionResponse<ApprovalActionResponse>("Only the assigned approver or an admin can reject");
    }

    await this.approvalsService.markRejected(taskId, input.decisionReason, input.approverId);
    await this.approvalsService.cancelRemaining(task.caseId, taskId);
    const rejected = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "REJECTED",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.decisionReason ?? "Rejected by assigned approver.",
      assignedTo: null,
    });

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(rejected),
      },
    };
  }

  @Post("/approvals/:taskId/request-info")
  @Roles("APPROVER", "ADMIN")
  async requestApprovalInfo(
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { question: string },
  ): Promise<ApprovalActionResponse> {
    const input = requestInfoSchema.parse({
      approverId: user.id,
      question: body.question,
    });
    const task = await this.approvalsService.getTask(taskId);
    if (!task) {
      return createErrorActionResponse<ApprovalActionResponse>("Approval task not found");
    }
    if (!(await this.authorizationService.canManageApprovalTask(user, taskId))) {
      return createErrorActionResponse<ApprovalActionResponse>(
        "Only the assigned approver or an admin can request follow-up information",
      );
    }

    await this.approvalsService.requestInfo(taskId, input.question, input.approverId);
    const updated = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "AWAITING_APPROVER_INFO_RESPONSE",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.question,
      assignedTo: task.case.requesterId,
    });

    await this.intakeService.createQuestion(task.caseId, input.question, "APPROVER_REQUEST");

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(updated),
      },
    };
  }

  @Post("/approvals/:taskId/delegate")
  @Roles("APPROVER", "ADMIN")
  async delegateApprovalTask(
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { delegateTo: string; reason?: string },
  ): Promise<ApprovalActionResponse> {
    const input = delegateApprovalSchema.parse(body);
    const task = await this.approvalsService.getTask(taskId);
    if (!task) {
      return createErrorActionResponse<ApprovalActionResponse>("Approval task not found");
    }

    if (task.status !== "PENDING" && task.status !== "INFO_REQUESTED") {
      return createErrorActionResponse<ApprovalActionResponse>("Only pending approval tasks can be delegated");
    }

    if (task.approverId !== user.id && !user.roles.includes("ADMIN")) {
      return createErrorActionResponse<ApprovalActionResponse>("Only the assigned approver or an admin can delegate");
    }

    await this.approvalsService.delegateTask({
      taskId,
      fromApproverId: task.approverId,
      toApproverId: input.delegateTo,
      reason: input.reason,
    });

    await this.auditService.recordEvent({
      caseId: task.caseId,
      eventType: "APPROVAL_TASK_DELEGATED",
      actorType: user.roles.includes("ADMIN") ? "ADMIN" : "APPROVER",
      actorId: user.id,
      payload: {
        taskId,
        fromApproverId: task.approverId,
        toApproverId: input.delegateTo,
        reason: input.reason ?? null,
      },
    });
    await this.casesService.assignCaseOwner(task.caseId, input.delegateTo);

    const caseRecord = await this.casesService.getCase(task.caseId);

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot({
          id: task.caseId,
          status: (caseRecord?.status ?? "AWAITING_APPROVAL") as CaseStatus,
        }),
      },
    };
  }

  @Get("/finance-review/cases")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  listFinanceReviewCases(@CurrentUser() user: AuthenticatedUser) {
    return this.financeReviewService.listOpenCases(user.id, user.roles.includes("ADMIN"));
  }

  @Get("/finance-review/analytics")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async getFinanceReviewAnalytics(): Promise<FinanceReviewAnalyticsSummary> {
    return financeReviewAnalyticsSummarySchema.parse(await this.financeReviewService.getFinanceReviewAnalytics());
  }

  @Post("/finance-review/:reviewId/approve")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async approveFinanceReview(
    @Param("reviewId") reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<FinanceReviewActionResponse> {
    const parsedBody = body as Record<string, unknown>;
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      ownerId: typeof parsedBody.ownerId === "string" ? parsedBody.ownerId : undefined,
      reasonCategory: typeof parsedBody.reasonCategory === "string" ? parsedBody.reasonCategory : undefined,
      codingDecision: typeof parsedBody.codingDecision === "string" ? parsedBody.codingDecision : undefined,
      reconciliationStatus: typeof parsedBody.reconciliationStatus === "string" ? parsedBody.reconciliationStatus : undefined,
      reconciledAmount: typeof parsedBody.reconciledAmount === "number" ? parsedBody.reconciledAmount : undefined,
      reconciledCurrency: typeof parsedBody.reconciledCurrency === "string" ? parsedBody.reconciledCurrency : undefined,
      annotation: typeof parsedBody.annotation === "string" ? parsedBody.annotation : undefined,
      note: typeof parsedBody.note === "string" ? parsedBody.note : undefined,
    });
    if (!(await this.authorizationService.canManageFinanceReview(user, reviewId))) {
      return createErrorActionResponse<FinanceReviewActionResponse>(
        "Only the assigned finance reviewer or an admin can approve this review",
      );
    }
    const review = await this.financeReviewService.resolveWithDetails({
      reviewId,
      reviewerId: input.reviewerId,
      outcome: "APPROVED",
      ownerId: input.ownerId,
      reasonCategory: input.reasonCategory,
      codingDecision: input.codingDecision,
      reconciliationStatus: input.reconciliationStatus,
      reconciledAmount: input.reconciledAmount,
      reconciledCurrency: input.reconciledCurrency,
      annotation: input.annotation,
      note: input.note,
    });
    await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "APPROVED",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Approved by finance reviewer.",
      assignedTo: null,
    });
    const exportReady = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "APPROVED",
      to: "EXPORT_READY",
      actorType: "SYSTEM",
      note: "Case marked export-ready after finance approval.",
      assignedTo: null,
    });
    const exportRecord = await this.exportsService.ensureExportReady(review.caseId);
    return {
      success: true,
      data: {
        review: toFinanceReviewResolution(review),
        case: toCaseStatusSnapshot(exportReady),
        exportRecord: exportRecord ? toExportRecordSnapshot(exportRecord) : null,
      },
    };
  }

  @Post("/finance-review/:reviewId/reject")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async rejectFinanceReview(
    @Param("reviewId") reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<FinanceReviewActionResponse> {
    const parsedBody = body as Record<string, unknown>;
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      ownerId: typeof parsedBody.ownerId === "string" ? parsedBody.ownerId : undefined,
      reasonCategory: typeof parsedBody.reasonCategory === "string" ? parsedBody.reasonCategory : undefined,
      codingDecision: typeof parsedBody.codingDecision === "string" ? parsedBody.codingDecision : undefined,
      reconciliationStatus: typeof parsedBody.reconciliationStatus === "string" ? parsedBody.reconciliationStatus : undefined,
      reconciledAmount: typeof parsedBody.reconciledAmount === "number" ? parsedBody.reconciledAmount : undefined,
      reconciledCurrency: typeof parsedBody.reconciledCurrency === "string" ? parsedBody.reconciledCurrency : undefined,
      annotation: typeof parsedBody.annotation === "string" ? parsedBody.annotation : undefined,
      note: typeof parsedBody.note === "string" ? parsedBody.note : undefined,
    });
    if (!(await this.authorizationService.canManageFinanceReview(user, reviewId))) {
      return createErrorActionResponse<FinanceReviewActionResponse>(
        "Only the assigned finance reviewer or an admin can reject this review",
      );
    }
    const review = await this.financeReviewService.resolveWithDetails({
      reviewId,
      reviewerId: input.reviewerId,
      outcome: "REJECTED",
      ownerId: input.ownerId,
      reasonCategory: input.reasonCategory,
      codingDecision: input.codingDecision,
      reconciliationStatus: input.reconciliationStatus,
      reconciledAmount: input.reconciledAmount,
      reconciledCurrency: input.reconciledCurrency,
      annotation: input.annotation,
      note: input.note,
    });
    const rejected = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "REJECTED",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Rejected by finance reviewer.",
      assignedTo: null,
    });
    return {
      success: true,
      data: {
        review: toFinanceReviewResolution(review),
        case: toCaseStatusSnapshot(rejected),
      },
    };
  }

  @Post("/finance-review/:reviewId/send-back")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async sendBackFinanceReview(
    @Param("reviewId") reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<FinanceReviewActionResponse> {
    const parsedBody = body as Record<string, unknown>;
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      ownerId: typeof parsedBody.ownerId === "string" ? parsedBody.ownerId : undefined,
      reasonCategory: typeof parsedBody.reasonCategory === "string" ? parsedBody.reasonCategory : undefined,
      codingDecision: typeof parsedBody.codingDecision === "string" ? parsedBody.codingDecision : undefined,
      reconciliationStatus: typeof parsedBody.reconciliationStatus === "string" ? parsedBody.reconciliationStatus : undefined,
      reconciledAmount: typeof parsedBody.reconciledAmount === "number" ? parsedBody.reconciledAmount : undefined,
      reconciledCurrency: typeof parsedBody.reconciledCurrency === "string" ? parsedBody.reconciledCurrency : undefined,
      annotation: typeof parsedBody.annotation === "string" ? parsedBody.annotation : undefined,
      note: typeof parsedBody.note === "string" ? parsedBody.note : undefined,
    });
    if (!(await this.authorizationService.canManageFinanceReview(user, reviewId))) {
      return createErrorActionResponse<FinanceReviewActionResponse>(
        "Only the assigned finance reviewer or an admin can send this review back",
      );
    }
    const review = await this.financeReviewService.resolveWithDetails({
      reviewId,
      reviewerId: input.reviewerId,
      outcome: "SENT_BACK",
      ownerId: input.ownerId,
      reasonCategory: input.reasonCategory,
      codingDecision: input.codingDecision,
      reconciliationStatus: input.reconciliationStatus,
      reconciledAmount: input.reconciledAmount,
      reconciledCurrency: input.reconciledCurrency,
      annotation: input.annotation,
      note: input.note,
    });
    const updated = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "AWAITING_REQUESTER_INFO",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Finance reviewer requested more information.",
      assignedTo: (await this.casesService.getCase(review.caseId))?.requesterId ?? null,
    });
    await this.intakeService.createQuestion(review.caseId, input.note ?? "Please provide more supporting information.", "FINANCE_REVIEW");
    return {
      success: true,
      data: {
        review: toFinanceReviewResolution(review),
        case: toCaseStatusSnapshot(updated),
      },
    };
  }

  @Post("/finance-review/:reviewId/assign")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async assignFinanceReview(
    @Param("reviewId") reviewId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FinanceReviewActionResponse> {
    const input = financeAssignSchema.parse(body);
    if (!(await this.authorizationService.canManageFinanceReview(user, reviewId))) {
      return createErrorActionResponse<FinanceReviewActionResponse>(
        "Only the assigned finance reviewer or an admin can assign ownership",
      );
    }
    const review = await this.financeReviewService.assignOwner(reviewId, input.ownerId);
    await this.casesService.assignCaseOwner(review.caseId, input.ownerId);
    await this.auditService.recordEvent({
      caseId: review.caseId,
      eventType: "FINANCE_REVIEW_ASSIGNED",
      actorType: user.roles.includes("ADMIN") ? "ADMIN" : "FINANCE_REVIEWER",
      actorId: user.id,
      payload: {
        reviewId,
        ownerId: input.ownerId,
      },
    });
    const caseRecord = await this.casesService.getCase(review.caseId);
    return {
      success: true,
      data: {
        review: toFinanceReviewResolution(review),
        case: toCaseStatusSnapshot({
          id: review.caseId,
          status: (caseRecord?.status ?? "FINANCE_REVIEW") as CaseStatus,
        }),
      },
    };
  }

  @Get(":id/export")
  async getExportRecord(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      throw new ForbiddenException("You do not have access to this case.");
    }
    return this.exportsService.getLatest(id);
  }

  @Post(":id/export")
  async processExport(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<ExportActionResponse> {
    if (!(await this.authorizationService.canViewCase(user, id))) {
      return createErrorActionResponse<ExportActionResponse>("You do not have access to this case.");
    }
    const result = await this.workflowOrchestrator.processExport(id);
    if (result && typeof result === "object" && "error" in result) {
      return createErrorActionResponse<ExportActionResponse>(String(result.error));
    }

    const successResult = result as {
      case: { id: string; status: CaseStatus };
      exportRecord: {
        id: string;
        caseId: string;
        status: string;
        connectorName?: string | null;
        errorMessage?: string | null;
      };
    };

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(successResult.case),
        exportRecord: toExportRecordSnapshot(successResult.exportRecord),
      },
    };
  }

  @Post(":id/recover")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async recoverCase(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Promise<RecoverActionResponse> {
    const result = await this.workflowOrchestrator.recoverCase(id, {
      actorId: user.id,
      actorType: user.roles.includes("ADMIN") ? "ADMIN" : "FINANCE_REVIEWER",
    });
    if (result && typeof result === "object" && "error" in result) {
      return createErrorActionResponse<RecoverActionResponse>(String(result.error));
    }

    const successResult = result as {
      case: { id: string; status: CaseStatus };
      policyResult: {
        passed: boolean;
        warnings: string[];
        blockingIssues: string[];
        requiresFinanceReview: boolean;
        duplicateSignals: string[];
        reconciliationFlags?: string[];
        approvalRequirement?: string | null;
      } | null;
    };

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(successResult.case),
        policyResult: successResult.policyResult,
      },
    };
  }
}
