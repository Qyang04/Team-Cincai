import { Body, Controller, ForbiddenException, Get, Post } from "@nestjs/common";
import {
  authSessionResponseSchema,
  authTokenResponseSchema,
  demoLoginRequestSchema,
  directoryDepartmentListResponseSchema,
  directoryUserListResponseSchema,
} from "@finance-ops/shared";
import { CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import type { AuthenticatedUser } from "./auth.types";
import { Public } from "./public.decorator";
import { Roles } from "./roles.decorator";
import { UserDirectoryService } from "./user-directory.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userDirectoryService: UserDirectoryService,
  ) {}

  @Get("me")
  async getCurrentSession(@CurrentUser() user: AuthenticatedUser) {
    const session = await this.authService.buildSessionResponse(user);
    return authSessionResponseSchema.parse(session);
  }

  @Post("demo-login")
  @Public()
  async demoLogin(@Body() body: unknown) {
    const input = demoLoginRequestSchema.parse(body);
    const result = await this.authService.issueDemoAccessToken(input.userId);
    return authTokenResponseSchema.parse(result);
  }

  @Get("demo-users")
  @Public()
  async listDemoUsers() {
    return directoryUserListResponseSchema.parse(await this.userDirectoryService.listDemoLoginUsers());
  }

  @Get("directory/users")
  @Roles("ADMIN")
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    if (!user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Admin access required.");
    }
    return directoryUserListResponseSchema.parse(await this.userDirectoryService.listUsers());
  }

  @Get("directory/departments")
  @Roles("ADMIN")
  async listDepartments(@CurrentUser() user: AuthenticatedUser) {
    if (!user.roles.includes("ADMIN")) {
      throw new ForbiddenException("Admin access required.");
    }
    return directoryDepartmentListResponseSchema.parse(await this.userDirectoryService.listDepartments());
  }
}
