import { Injectable, OnModuleInit } from "@nestjs/common";
import { ArtifactExtractionService } from "./artifact-extraction.service";
import { queueNames } from "./queue.constants";
import { AiGatewayService } from "./ai-gateway.service";
import { ApprovalsService } from "./approvals.service";
import { AuditService } from "./audit.service";
import { CasesService } from "./cases.service";
import { ExportsService } from "./exports.service";
import { FinanceReviewService } from "./finance-review.service";
import { JobRunnerService } from "./job-runner.service";
import { NotificationsService } from "./notifications.service";
import { PolicyService } from "./policy.service";
import { TelemetryService } from "./telemetry.service";
import { WorkflowService } from "./workflow.service";

@Injectable()
export class WorkflowExecutionService implements OnModuleInit {
  constructor(
    private readonly artifactExtractionService: ArtifactExtractionService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly policyService: PolicyService,
    private readonly approvalsService: ApprovalsService,
    private readonly financeReviewService: FinanceReviewService,
    private readonly workflowService: WorkflowService,
    private readonly auditService: AuditService,
    private readonly exportsService: ExportsService,
    private readonly casesService: CasesService,
    private readonly notificationsService: NotificationsService,
    private readonly telemetry: TelemetryService,
    private readonly jobRunner: JobRunnerService,
  ) {}

  onModuleInit() {
    this.jobRunner.registerHandler(queueNames.artifactProcessing, this.handleArtifactProcessing.bind(this));
    this.jobRunner.registerHandler(queueNames.aiIntake, this.handleAiIntake.bind(this));
    this.jobRunner.registerHandler(queueNames.policyEvaluation, this.handlePolicyRoute.bind(this));
    this.jobRunner.registerHandler(queueNames.exportProcessing, this.handleExport.bind(this));
  }

  async handleArtifactProcessing(payload: { artifactId: string }) {
    this.telemetry.increment("artifact.processing.jobs");
    return this.artifactExtractionService.processArtifact(payload.artifactId);
  }

  async handleAiIntake(payload: {
    workflowType: "EXPENSE_CLAIM" | "PETTY_CASH_REIMBURSEMENT" | "VENDOR_INVOICE_APPROVAL" | "INTERNAL_PAYMENT_REQUEST";
    notes?: string;
    filenames: string[];
  }) {
    this.telemetry.increment("ai.intake.jobs");
    return this.aiGatewayService.analyzeIntake(payload);
  }

  async handlePolicyRoute(payload: { caseId: string }) {
    this.telemetry.increment("policy.evaluation.jobs");
    const caseRecord = await this.casesService.getCase(payload.caseId);
    if (!caseRecord || caseRecord.status !== "POLICY_REVIEW") {
      return null;
    }

    const policyResult = await this.policyService.evaluateCase(payload.caseId);

    await this.auditService.recordEvent({
      caseId: payload.caseId,
      eventType: "POLICY_EVALUATED",
      actorType: "SYSTEM",
      payload: policyResult as unknown as Record<string, unknown>,
    });

    if (!policyResult.passed || policyResult.requiresFinanceReview) {
      const updated = await this.workflowService.transitionCase({
        caseId: payload.caseId,
        from: "POLICY_REVIEW",
        to: "FINANCE_REVIEW",
        actorType: "SYSTEM",
        note: "Policy evaluation routed case to finance review.",
      });

      await this.financeReviewService.enqueue(
        payload.caseId,
        policyResult.blockingIssues.join("; ") || policyResult.warnings.join("; "),
      );
      await this.notificationsService.send({
        type: "finance-review-required",
        recipientId: "finance.reviewer",
        subject: "Finance review required",
        body: `Case ${payload.caseId} requires finance review.`,
        caseId: payload.caseId,
      });
      return { case: updated, policyResult };
    }

    const updated = await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "POLICY_REVIEW",
      to: "AWAITING_APPROVAL",
      actorType: "SYSTEM",
      note: "Policy evaluation routed case to manager approval.",
    });

    await this.approvalsService.createTask(payload.caseId, "manager.approver");
    await this.notificationsService.send({
      type: "approval-required",
      recipientId: "manager.approver",
      subject: "Approval required",
      body: `Case ${payload.caseId} is awaiting approval.`,
      caseId: payload.caseId,
    });
    return { case: updated, policyResult };
  }

  async handleExport(payload: { caseId: string }) {
    this.telemetry.increment("export.jobs");
    const caseRecord = await this.casesService.getCase(payload.caseId);
    if (!caseRecord) {
      return { error: "Case not found" } as const;
    }
    if (caseRecord.status !== "EXPORT_READY") {
      return { error: "Case is not ready for export" } as const;
    }

    await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "EXPORT_READY",
      to: "EXPORTING",
      actorType: "SYSTEM",
      note: "Started export processing.",
    });

    const exportRecord = await this.exportsService.process(payload.caseId);

    if (exportRecord.status === "FAILED") {
      const failed = await this.workflowService.transitionCase({
        caseId: payload.caseId,
        from: "EXPORTING",
        to: "RECOVERABLE_EXCEPTION",
        actorType: "SYSTEM",
        note: exportRecord.errorMessage ?? "Export failed.",
      });
      return { case: failed, exportRecord };
    }

    await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "EXPORTING",
      to: "EXPORTED",
      actorType: "SYSTEM",
      note: "Export completed successfully.",
    });
    const closed = await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "EXPORTED",
      to: "CLOSED",
      actorType: "SYSTEM",
      note: "Case closed after successful export.",
    });

    return { case: closed, exportRecord };
  }
}
