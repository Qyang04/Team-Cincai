import { Module } from "@nestjs/common";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { AdminConfigService } from "./admin-config.service";
import { AdminController } from "./admin.controller";
import { ApprovalsService } from "./approvals.service";
import { AiGatewayService } from "./ai-gateway.service";
import { ArtifactExtractionService } from "./artifact-extraction.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { AuthorizationService } from "./authorization.service";
import { ArtifactsService } from "./artifacts.service";
import { AuditService } from "./audit.service";
import { CaseDetailService } from "./case-detail.service";
import { DebugDocumentsController } from "./debug-documents.controller";
import { DocumentOcrService } from "./document-ocr.service";
import { HealthController } from "./health.controller";
import { CasesController } from "./cases.controller";
import { ConnectorHealthService } from "./connector-health.service";
import { ExportsService } from "./exports.service";
import { FinanceReviewService } from "./finance-review.service";
import { JobRunnerService } from "./job-runner.service";
import { LocalArtifactStorageService } from "./local-artifact-storage.service";
import { CasesService } from "./cases.service";
import { IntakeService } from "./intake.service";
import { MockAiProviderService } from "./mock-ai-provider.service";
import { NotificationsService } from "./notifications.service";
import { PdfTextExtractionService } from "./pdf-text-extraction.service";
import { PolicyService } from "./policy.service";
import { PrismaService } from "./prisma.service";
import { QueueWorkerService } from "./queue-worker.service";
import { RolesGuard } from "./roles.guard";
import { StorageService } from "./storage.service";
import { TelemetryService } from "./telemetry.service";
import { DirectorySeedService } from "./directory-seed.service";
import { UserDirectoryService } from "./user-directory.service";
import { WorkflowOrchestratorService } from "./workflow-orchestrator.service";
import { WorkflowExecutionService } from "./workflow-execution.service";
import { WorkflowService } from "./workflow.service";
import { ZaiAiProviderService } from "./zai-ai-provider.service";
import { JwtModule } from "@nestjs/jwt";

@Module({
  imports: [JwtModule.register({})],
  controllers: [HealthController, CasesController, AdminController, AuthController, DebugDocumentsController],
  providers: [
    Reflector,
    PrismaService,
    WorkflowService,
    CasesService,
    AiGatewayService,
    ArtifactExtractionService,
    AuthService,
    AuthorizationService,
    ArtifactsService,
    AuditService,
    TelemetryService,
    NotificationsService,
    DocumentOcrService,
    IntakeService,
    CaseDetailService,
    AdminConfigService,
    ConnectorHealthService,
    PdfTextExtractionService,
    PolicyService,
    ApprovalsService,
    FinanceReviewService,
    ExportsService,
    JobRunnerService,
    UserDirectoryService,
    DirectorySeedService,
    WorkflowOrchestratorService,
    WorkflowExecutionService,
    QueueWorkerService,
    MockAiProviderService,
    ZaiAiProviderService,
    LocalArtifactStorageService,
    StorageService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
