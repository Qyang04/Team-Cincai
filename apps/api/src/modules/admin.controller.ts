import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  adminApprovalMatrixConfigUpdateSchema,
  adminDelegationConfigUpdateSchema,
  adminPolicyConfigUpdateSchema,
  adminRoutingConfigUpdateSchema,
} from "@finance-ops/shared";
import { Roles } from "./roles.decorator";
import { AdminConfigService } from "./admin-config.service";
import { ConnectorHealthService } from "./connector-health.service";

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
    const input = adminPolicyConfigUpdateSchema.parse(body);
    return this.adminConfigService.updatePolicyConfig(input);
  }

  @Get("routing")
  getRouting() {
    return this.adminConfigService.getRoutingConfig();
  }

  @Post("routing")
  updateRouting(@Body() body: unknown) {
    const input = adminRoutingConfigUpdateSchema.parse(body);
    return this.adminConfigService.updateRoutingConfig(input);
  }

  @Get("delegations")
  getDelegations() {
    return this.adminConfigService.getDelegationConfig();
  }

  @Post("delegations")
  updateDelegations(@Body() body: unknown) {
    const input = adminDelegationConfigUpdateSchema.parse(body);
    return this.adminConfigService.updateDelegationConfig(input);
  }

  @Get("approval-matrix")
  getApprovalMatrix() {
    return this.adminConfigService.getApprovalMatrixConfig();
  }

  @Post("approval-matrix")
  updateApprovalMatrix(@Body() body: unknown) {
    const input = adminApprovalMatrixConfigUpdateSchema.parse(body);
    return this.adminConfigService.updateApprovalMatrixConfig(input);
  }

  @Get("connectors")
  getConnectors() {
    return this.connectorHealthService.getStatus();
  }
}
