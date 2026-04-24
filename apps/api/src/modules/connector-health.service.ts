import { Injectable } from "@nestjs/common";
import { adminConnectorsResponseSchema, type AdminConnectorStatus } from "@finance-ops/shared";

@Injectable()
export class ConnectorHealthService {
  getStatus(): AdminConnectorStatus[] {
    const queueMode = process.env.QUEUE_MODE ?? "inline";
    const useMockAi = (process.env.USE_MOCK_AI ?? "true").toLowerCase() !== "false";
    const useMockAuth = (process.env.USE_MOCK_AUTH ?? "false").toLowerCase() === "true";
    const useMockStorage = (process.env.USE_MOCK_STORAGE ?? "true").toLowerCase() !== "false";

    return adminConnectorsResponseSchema.parse([
      {
        connector: "Document extraction",
        status: "mock-ready",
        detail: "Artifact extraction uses a mock processor with queue lifecycle support.",
      },
      {
        connector: "Z.AI reasoning",
        status: useMockAi ? "mock-enabled" : "configured-runtime",
        detail: useMockAi ? "Mock AI provider is active." : "Live Z.AI provider selected by runtime flags.",
      },
      {
        connector: "Auth",
        status: useMockAuth ? "mock-enabled" : "app-session-jwt",
        detail: useMockAuth
          ? "Mock headers drive user identity and role selection."
          : "App-issued demo JWT sessions are active, with Supabase JWT support available when configured.",
      },
      {
        connector: "Storage",
        status: useMockStorage ? "mock-enabled" : "supabase-storage",
        detail: useMockStorage ? "Upload preparation returns mock signed-upload responses." : "Supabase-compatible upload preparation is active.",
      },
      {
        connector: "Queue execution",
        status: queueMode === "bullmq" ? "worker-backed" : "inline-fallback",
        detail: queueMode === "bullmq" ? "BullMQ workers process registered workflow jobs." : "Queue facade executes handlers inline for local development.",
      },
      {
        connector: "Accounting export",
        status: "stub-defined",
        detail: "Mock export lifecycle is active with recoverable exception support.",
      },
    ]);
  }
}
