import { Controller, Get } from "@nestjs/common";
import { ConnectorHealthService } from "./connector-health.service";
import { TelemetryService } from "./telemetry.service";

@Controller("health")
export class HealthController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly connectorHealthService: ConnectorHealthService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "finance-ops-api",
      timestamp: new Date().toISOString(),
      telemetry: this.telemetry.snapshot(),
      connectors: this.connectorHealthService.getStatus(),
    };
  }
}
