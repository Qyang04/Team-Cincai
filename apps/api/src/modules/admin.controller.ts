import { Body, Controller, Get, Post } from "@nestjs/common";
import { Roles } from "./roles.decorator";
import { AdminConfigService } from "./admin-config.service";
import { ConnectorHealthService } from "./connector-health.service";
import { adminPolicyConfigSchema, adminRoutingConfigSchema } from "./dto";

@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  constructor(
    private readonly adminConfigService: AdminConfigService,
    private readonly connectorHealthService: ConnectorHealthService,
  ) {}

  @Get("policies")
  getPolicies() {
    return this.adminConfigService.getPolicyConfig();
  }

  @Post("policies")
  updatePolicies(@Body() body: unknown) {
    const input = adminPolicyConfigSchema.parse(body);
    return this.adminConfigService.updatePolicyConfig(input);
  }

  @Get("routing")
  getRouting() {
    return this.adminConfigService.getRoutingConfig();
  }

  @Post("routing")
  updateRouting(@Body() body: unknown) {
    const input = adminRoutingConfigSchema.parse(body);
    return this.adminConfigService.updateRoutingConfig(input);
  }

  @Get("connectors")
  getConnectors() {
    return this.connectorHealthService.getStatus();
  }
}
