import { Injectable, OnModuleInit } from "@nestjs/common";
import { ArtifactExtractionService } from "./artifact-extraction.service";
import { queueNames } from "./queue.constants";
import { AdminConfigService } from "./admin-config.service";
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
    private readonly adminConfigService: AdminConfigService,
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
    artifacts: Array<{
      id: string;
      filename: string;
      mimeType?: string | null;
      source?: string | null;
      extractedText?: string | null;
      processingStatus: string;
      checksum?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
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
    const routingConfig = await this.adminConfigService.getRoutingConfig();

    await this.auditService.recordEvent({
      caseId: payload.caseId,
      eventType: "POLICY_EVALUATED",
      actorType: "SYSTEM",
      payload: policyResult as unknown as Record<string, unknown>,
    });

    if (policyResult.duplicateSignals.length > 0) {
      await this.auditService.recordEvent({
        caseId: payload.caseId,
        eventType: "POLICY_DUPLICATE_SIGNAL_RAISED",
        actorType: "SYSTEM",
        payload: {
          duplicateSignals: policyResult.duplicateSignals,
          approvalRequirement: policyResult.approvalRequirement ?? null,
        },
      });
    }

    if (!policyResult.passed || policyResult.requiresFinanceReview) {
      const updated = await this.workflowService.transitionCase({
        caseId: payload.caseId,
        from: "POLICY_REVIEW",
        to: "FINANCE_REVIEW",
        actorType: "SYSTEM",
        note: "Policy evaluation routed case to finance review.",
        assignedTo: routingConfig.financeReviewerId,
      });

      await this.financeReviewService.enqueue(
        payload.caseId,
        policyResult.blockingIssues.join("; ") || policyResult.warnings.join("; "),
        routingConfig.financeReviewerId,
      );
      await this.notificationsService.send({
        type: "finance-review-required",
        recipientId: routingConfig.financeReviewerId,
        subject: "Finance review required",
        body: `Case ${payload.caseId} requires finance review.`,
        caseId: payload.caseId,
      });
      return { case: updated, policyResult };
    }

    const approvalTasks = await this.approvalsService.createMatrixTasks({
      caseId: payload.caseId,
      workflowType: caseRecord.workflowType,
      latestExtractionFields: caseRecord.extractionResults[0]?.fieldsJson,
      policyResult,
      routingConfig,
      managerApprovalThreshold: (await this.adminConfigService.getPolicyConfig()).managerApprovalThreshold,
    });
    const recipients = [...new Set(approvalTasks.filter((task) => task.status === "PENDING").map((task) => task.approverId))];
    const updated = await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "POLICY_REVIEW",
      to: "AWAITING_APPROVAL",
      actorType: "SYSTEM",
      note: "Policy evaluation routed case to manager approval.",
      assignedTo: recipients[0] ?? null,
    });
    for (const recipientId of recipients) {
      await this.notificationsService.send({
        type: "approval-required",
        recipientId,
        subject: "Approval required",
        body: `Case ${payload.caseId} is awaiting approval.`,
        caseId: payload.caseId,
      });
    }
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
      assignedTo: null,
    });

    const exportRecord = await this.exportsService.process(payload.caseId);

    if (exportRecord.status === "FAILED") {
      const failed = await this.workflowService.transitionCase({
        caseId: payload.caseId,
        from: "EXPORTING",
        to: "RECOVERABLE_EXCEPTION",
        actorType: "SYSTEM",
        note: exportRecord.errorMessage ?? "Export failed.",
        assignedTo: null,
      });
      return { case: failed, exportRecord };
    }

    await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "EXPORTING",
      to: "EXPORTED",
      actorType: "SYSTEM",
      note: "Export completed successfully.",
      assignedTo: null,
    });
    const closed = await this.workflowService.transitionCase({
      caseId: payload.caseId,
      from: "EXPORTED",
      to: "CLOSED",
      actorType: "SYSTEM",
      note: "Case closed after successful export.",
      assignedTo: null,
    });

    return { case: closed, exportRecord };
  }
}
