import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createCaseSchema,
  submitCaseSchema,
  type ApprovalActionResponse,
  type CaseStatus,
  type ExportActionResponse,
  type FinanceReviewActionResponse,
  type QuestionResponseActionResponse,
  type RecoverActionResponse,
  type WorkflowType,
} from "@finance-ops/shared";
import { ApprovalsService } from "./approvals.service";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { CaseDetailService } from "./case-detail.service";
import { CasesService } from "./cases.service";
import {
  answerQuestionSchema,
  approvalDecisionSchema,
  attachArtifactsSchema,
  completeArtifactUploadSchema,
  financeDecisionSchema,
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
  outcome?: string | null;
  note?: string | null;
}) {
  return {
    id: input.id,
    caseId: input.caseId,
    reviewerId: input.reviewerId ?? null,
    outcome: input.outcome ?? null,
    note: input.note ?? null,
  };
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
    private readonly storageService: StorageService,
    private readonly workflowOrchestrator: WorkflowOrchestratorService,
  ) {}

  @Get()
  listCases() {
    return this.casesService.listCases();
  }

  @Get(":id")
  getCase(@Param("id") id: string) {
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
    @Body()
    body: {
      notes?: string;
      filenames?: string[];
    },
  ) {
    const input = submitCaseSchema.parse(body);
    return this.workflowOrchestrator.submitDraftCase(id, input);
  }

  @Get(":id/artifacts")
  getArtifacts(@Param("id") id: string) {
    return this.artifactsService.listForCase(id);
  }

  @Post(":id/artifacts/upload-url")
  prepareArtifactUpload(
    @Param("id") id: string,
    @Body()
    body: {
      filename: string;
      mimeType?: string;
    },
  ) {
    const input = prepareUploadSchema.parse(body);
    return this.storageService.prepareUpload({
      caseId: id,
      filename: input.filename,
      mimeType: input.mimeType,
    });
  }

  @Post(":id/artifacts")
  attachArtifacts(
    @Param("id") id: string,
    @Body()
    body: {
      filenames: string[];
      mimeType?: string;
    },
  ) {
    const input = attachArtifactsSchema.parse(body);
    return this.artifactsService.attachMany(id, input.filenames, {
      mimeType: input.mimeType,
      storagePrefix: "mock://artifacts",
      processingStatus: "PREPARED",
    });
  }

  @Post(":id/artifacts/:artifactId/complete")
  completeArtifactUpload(
    @Param("id") id: string,
    @Param("artifactId") artifactId: string,
    @Body()
    body: {
      storageUri?: string;
    },
  ) {
    const input = completeArtifactUploadSchema.parse(body);
    return this.workflowOrchestrator.processArtifactUpload(id, artifactId, input.storageUri);
  }

  @Post(":id/artifacts/process")
  processArtifact(
    @Param("id") id: string,
    @Body()
    body: {
      artifactId: string;
    },
  ) {
    const input = processArtifactSchema.parse(body);
    return this.workflowOrchestrator.processArtifactUpload(id, input.artifactId);
  }

  @Get(":id/questions")
  getQuestions(@Param("id") id: string) {
    return this.intakeService.listQuestions(id);
  }

  @Post(":id/questions/:questionId/respond")
  async answerQuestion(
    @Param("id") id: string,
    @Param("questionId") questionId: string,
    @Body()
    body: {
      answer: string;
    },
  ): Promise<QuestionResponseActionResponse> {
    const input = answerQuestionSchema.parse(body);
    const answered = await this.intakeService.answerQuestion(id, questionId, input.answer);
    const caseRecord = await this.casesService.getCase(id);
    const allQuestionsAnswered = caseRecord?.openQuestions.every(
      (question) => question.status === "ANSWERED",
    );

    await this.auditService.recordEvent({
      caseId: id,
      eventType: "QUESTION_ANSWERED",
      actorType: "REQUESTER",
      actorId: caseRecord?.requesterId,
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
  getTransitions(@Param("id") id: string) {
    return this.casesService.getTransitions(id);
  }

  @Get(":id/audit-events")
  getAuditEvents(@Param("id") id: string) {
    return this.auditService.listForCase(id);
  }

  @Post(":id/policy-review/run")
  runPolicyReview(@Param("id") id: string) {
    return this.workflowOrchestrator.runPolicyAndRoute(id);
  }

  @Get(":id/policy-result")
  getLatestPolicyResult(@Param("id") id: string) {
    return this.policyService.getLatestPolicyResult(id);
  }

  @Get("/approvals/tasks")
  @Roles("APPROVER", "ADMIN")
  listApprovalTasks() {
    return this.approvalsService.listPendingTasks();
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

    await this.approvalsService.markApproved(taskId, input.decisionReason);
    await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "APPROVED",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.decisionReason ?? "Approved by assigned approver.",
    });
    const exportReadyCase = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "APPROVED",
      to: "EXPORT_READY",
      actorType: "SYSTEM",
      note: "Case marked ready for export after approval.",
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

    await this.approvalsService.markRejected(taskId, input.decisionReason);
    const rejected = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "REJECTED",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.decisionReason ?? "Rejected by assigned approver.",
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

    await this.approvalsService.requestInfo(taskId, input.question);
    const updated = await this.workflowService.transitionCase({
      caseId: task.caseId,
      from: "AWAITING_APPROVAL",
      to: "AWAITING_APPROVER_INFO_RESPONSE",
      actorType: "APPROVER",
      actorId: input.approverId,
      note: input.question,
    });

    await this.intakeService.createQuestion(task.caseId, input.question, "APPROVER_REQUEST");

    return {
      success: true,
      data: {
        case: toCaseStatusSnapshot(updated),
      },
    };
  }

  @Get("/finance-review/cases")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  listFinanceReviewCases() {
    return this.financeReviewService.listOpenCases();
  }

  @Post("/finance-review/:reviewId/approve")
  @Roles("FINANCE_REVIEWER", "ADMIN")
  async approveFinanceReview(
    @Param("reviewId") reviewId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { note?: string },
  ): Promise<FinanceReviewActionResponse> {
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      note: body.note,
    });
    const review = await this.financeReviewService.resolve(reviewId, input.reviewerId, "APPROVED", input.note);
    await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "APPROVED",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Approved by finance reviewer.",
    });
    const exportReady = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "APPROVED",
      to: "EXPORT_READY",
      actorType: "SYSTEM",
      note: "Case marked export-ready after finance approval.",
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
    @Body() body: { note?: string },
  ): Promise<FinanceReviewActionResponse> {
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      note: body.note,
    });
    const review = await this.financeReviewService.resolve(reviewId, input.reviewerId, "REJECTED", input.note);
    const rejected = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "REJECTED",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Rejected by finance reviewer.",
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
    @Body() body: { note?: string },
  ): Promise<FinanceReviewActionResponse> {
    const input = financeDecisionSchema.parse({
      reviewerId: user.id,
      note: body.note,
    });
    const review = await this.financeReviewService.resolve(reviewId, input.reviewerId, "SENT_BACK", input.note);
    const updated = await this.workflowService.transitionCase({
      caseId: review.caseId,
      from: "FINANCE_REVIEW",
      to: "AWAITING_REQUESTER_INFO",
      actorType: "FINANCE_REVIEWER",
      actorId: input.reviewerId,
      note: input.note ?? "Finance reviewer requested more information.",
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

  @Get(":id/export")
  getExportRecord(@Param("id") id: string) {
    return this.exportsService.getLatest(id);
  }

  @Post(":id/export")
  async processExport(@Param("id") id: string): Promise<ExportActionResponse> {
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
