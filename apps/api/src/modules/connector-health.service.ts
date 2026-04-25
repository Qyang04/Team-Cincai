import { Injectable } from "@nestjs/common";
import { adminConnectorsResponseSchema, type AdminConnectorStatus } from "@finance-ops/shared";

@Injectable()
export class ConnectorHealthService {
  getStatus(): AdminConnectorStatus[] {
    const queueMode = process.env.QUEUE_MODE ?? "inline";
    const zaiConfigured = Boolean(process.env.ZAI_API_KEY);
    const useMockAuth = (process.env.USE_MOCK_AUTH ?? "false").toLowerCase() === "true";
    const supabaseConfigured = Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    return adminConnectorsResponseSchema.parse([
      {
        connector: "Document extraction",
        status: "mock-ready",
        detail: "Artifact extraction uses a mock processor with queue lifecycle support.",
      },
      {
        connector: "Z.AI reasoning",
        status: zaiConfigured ? "configured-runtime" : "missing-credentials",
        detail: zaiConfigured
          ? "Live Z.AI provider is the only intake reasoning path."
          : "ZAI_API_KEY is not set; intake jobs will fail until configured.",
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
        status: supabaseConfigured ? "supabase-storage" : "local-disk-only",
        detail: supabaseConfigured
          ? "Supabase-compatible upload preparation is active for signed URL flows."
          : "Direct uploads land on the API server's local disk; configure Supabase to enable signed-URL uploads.",
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
