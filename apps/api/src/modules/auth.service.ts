import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { RoleType } from "@finance-ops/shared";
import type { AuthenticatedUser } from "./auth.types";

type MockRoleHeader = RoleType | "ALL";

@Injectable()
export class AuthService {
  private readonly useMockAuth = (process.env.USE_MOCK_AUTH ?? "true").toLowerCase() !== "false";

  constructor(private readonly jwtService: JwtService) {}

  async resolveUserFromRequest(input: {
    authorization?: string;
    mockUserId?: string;
    mockRole?: MockRoleHeader;
  }): Promise<AuthenticatedUser> {
    if (this.useMockAuth) {
      const mockRole = input.mockRole;
      const roles: RoleType[] =
        mockRole === "ALL"
          ? ["REQUESTER", "APPROVER", "FINANCE_REVIEWER", "ADMIN"]
          : mockRole
            ? [mockRole]
            : ["REQUESTER"];

      return {
        id: input.mockUserId ?? "demo.requester",
        roles,
        source: "mock",
      };
    }

    const token = input.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException("Supabase JWT secret is not configured.");
    }

    const decoded = await this.jwtService.verifyAsync<{
      sub: string;
      email?: string;
      app_metadata?: { roles?: string[] };
    }>(token, { secret });

    const roles = (decoded.app_metadata?.roles ?? [])
      .filter((role): role is RoleType =>
        ["REQUESTER", "APPROVER", "FINANCE_REVIEWER", "ADMIN"].includes(role),
      );

    return {
      id: decoded.sub,
      email: decoded.email,
      roles: roles.length ? roles : ["REQUESTER"],
      source: "supabase",
    };
  }
}

