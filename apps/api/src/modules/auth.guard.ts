import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService } from "./auth.service";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

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
