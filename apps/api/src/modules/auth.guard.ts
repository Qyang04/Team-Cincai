import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : undefined;
    const mockUserId = typeof request.headers["x-mock-user-id"] === "string" ? request.headers["x-mock-user-id"] : undefined;
    const mockRole = typeof request.headers["x-mock-role"] === "string" ? request.headers["x-mock-role"] : undefined;

    request.user = await this.authService.resolveUserFromRequest({
      authorization,
      mockUserId,
      mockRole: mockRole as never,
    });

    return true;
  }
}

