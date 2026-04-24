import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { type AuthSessionResponse, type RoleType, type SessionUser } from "@finance-ops/shared";
import type { AuthenticatedUser } from "./auth.types";
import { UserDirectoryService } from "./user-directory.service";

type MockRoleHeader = RoleType | "ALL";

@Injectable()
export class AuthService {
  private readonly useMockAuth = (process.env.USE_MOCK_AUTH ?? "false").toLowerCase() === "true";
  private readonly demoAuthSecret = process.env.APP_JWT_SECRET ?? "demo-auth-secret";
  private readonly allowDemoLogin = (process.env.ALLOW_DEMO_LOGIN ?? "true").toLowerCase() !== "false";

  constructor(
    private readonly jwtService: JwtService,
    private readonly userDirectoryService: UserDirectoryService,
  ) {}

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
        email: `${input.mockUserId ?? "demo.requester"}@mock.local`,
        displayName: input.mockUserId ?? "Demo Requester",
        roles,
        departmentId: null,
        departmentCode: null,
        departmentName: null,
        managerUserId: null,
        source: "mock",
      };
    }

    const token = input.authorization?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing bearer token.");
    }

    const appSecret = this.demoAuthSecret;

    try {
      const decoded = await this.jwtService.verifyAsync<{
        sub: string;
        email?: string;
        type?: string;
      }>(token, { secret: appSecret });

      if (decoded.type === "demo-session") {
        const directoryUser = await this.userDirectoryService.getUserById(decoded.sub);
        if (!directoryUser || !directoryUser.isActive) {
          throw new UnauthorizedException("User profile is missing or inactive.");
        }

        return {
          id: directoryUser.id,
          email: directoryUser.email,
          displayName: directoryUser.displayName,
          roles: directoryUser.roles,
          departmentId: directoryUser.departmentId,
          departmentCode: directoryUser.departmentCode,
          departmentName: directoryUser.departmentName,
          managerUserId: directoryUser.managerUserId,
          source: "app",
        };
      }
    } catch {
      /* fall through to Supabase verification */
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException("JWT verification secret is not configured.");
    }
    const decoded = await this.jwtService.verifyAsync<{
      sub: string;
      email?: string;
      app_metadata?: { roles?: string[] };
    }>(token, { secret });

    const directoryUser =
      (decoded.email ? await this.userDirectoryService.getUserByEmail(decoded.email) : null) ??
      (await this.userDirectoryService.getUserById(decoded.sub));
    const roles = directoryUser?.roles
      ? directoryUser.roles
      : (decoded.app_metadata?.roles ?? []).filter(
          (role): role is RoleType => ["REQUESTER", "APPROVER", "FINANCE_REVIEWER", "ADMIN"].includes(role),
        );

    return {
      id: directoryUser?.id ?? decoded.sub,
      email: directoryUser?.email ?? decoded.email,
      displayName: directoryUser?.displayName ?? decoded.email ?? decoded.sub,
      roles: roles.length ? roles : ["REQUESTER"],
      departmentId: directoryUser?.departmentId ?? null,
      departmentCode: directoryUser?.departmentCode ?? null,
      departmentName: directoryUser?.departmentName ?? null,
      managerUserId: directoryUser?.managerUserId ?? null,
      source: "supabase",
    };
  }

  async issueDemoAccessToken(userId: string) {
    if (!this.allowDemoLogin) {
      throw new UnauthorizedException("Demo login is disabled.");
    }

    const directoryUser = await this.userDirectoryService.getUserById(userId);
    if (!directoryUser || !directoryUser.isActive) {
      throw new UnauthorizedException("Demo user not found.");
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: directoryUser.id,
        email: directoryUser.email,
        type: "demo-session",
      },
      {
        secret: this.demoAuthSecret,
        expiresIn: "12h",
      },
    );

    return {
      accessToken,
      user: this.toSessionUser({
        ...directoryUser,
        source: "app",
      }),
    };
  }

  async buildSessionResponse(user: AuthenticatedUser): Promise<AuthSessionResponse> {
    const directoryUser =
      (await this.userDirectoryService.getUserById(user.id)) ??
      (user.email ? await this.userDirectoryService.getUserByEmail(user.email) : null);

    const effectiveUser: SessionUser = this.toSessionUser({
      id: directoryUser?.id ?? user.id,
      email: directoryUser?.email ?? user.email ?? `${user.id}@finance-ops.local`,
      displayName: directoryUser?.displayName ?? user.displayName ?? user.id,
      roles: directoryUser?.roles ?? user.roles,
      departmentId: directoryUser?.departmentId ?? user.departmentId ?? null,
      departmentCode: directoryUser?.departmentCode ?? user.departmentCode ?? null,
      departmentName: directoryUser?.departmentName ?? user.departmentName ?? null,
      managerUserId: directoryUser?.managerUserId ?? user.managerUserId ?? null,
      source: user.source,
    });

    return {
      user: effectiveUser,
      workspace: {
        canCreateCase: effectiveUser.roles.includes("REQUESTER") || effectiveUser.roles.includes("ADMIN"),
        canViewApprovals: effectiveUser.roles.includes("APPROVER") || effectiveUser.roles.includes("ADMIN"),
        canViewFinanceReview:
          effectiveUser.roles.includes("FINANCE_REVIEWER") || effectiveUser.roles.includes("ADMIN"),
        canViewAdmin: effectiveUser.roles.includes("ADMIN"),
      },
    };
  }

  private toSessionUser(input: {
    id: string;
    email: string;
    displayName: string;
    roles: RoleType[];
    departmentId?: string | null;
    departmentCode?: string | null;
    departmentName?: string | null;
    managerUserId?: string | null;
    source: "mock" | "app" | "supabase";
  }): SessionUser {
    return {
      id: input.id,
      email: input.email,
      displayName: input.displayName,
      roles: input.roles,
      departmentId: input.departmentId ?? null,
      departmentCode: input.departmentCode ?? null,
      departmentName: input.departmentName ?? null,
      managerUserId: input.managerUserId ?? null,
      source: input.source,
    };
  }
}
