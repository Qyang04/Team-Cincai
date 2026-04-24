"use client";

import {
  DEFAULT_API_BASE_URL,
  authTokenResponseSchema,
  directoryUserListResponseSchema,
  type DirectoryUser,
} from "@finance-ops/shared";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setClientAccessToken } from "../lib/client-session";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

function getRoleCardClass(userId: string): string {
  if (userId === "demo.requester") {
    return "login-role-card login-role-card-requester";
  }
  if (userId === "manager.approver") {
    return "login-role-card login-role-card-approver";
  }
  if (userId === "finance.reviewer") {
    return "login-role-card login-role-card-finance";
  }
  return "login-role-card login-role-card-admin";
}

function getRoleBadgeClass(userId: string): string {
  if (userId === "demo.requester") {
    return "login-role-badge login-role-badge-requester";
  }
  if (userId === "manager.approver") {
    return "login-role-badge login-role-badge-approver";
  }
  if (userId === "finance.reviewer") {
    return "login-role-badge login-role-badge-finance";
  }
  return "login-role-badge login-role-badge-admin";
}

function getRoleSummary(user: DirectoryUser): string {
  if (user.id === "demo.requester") {
    return "Start the demo here: create and submit a case.";
  }
  if (user.id === "manager.approver") {
    return "Review and approve the manager queue.";
  }
  if (user.id === "finance.reviewer") {
    return "Handle finance-review cases when policy escalates.";
  }
  return "See every lane and admin configuration in one account.";
}

export default function LoginPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/demo-users`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Unable to load demo users (${response.status}).`);
        }
        const payload = directoryUserListResponseSchema.parse(await response.json());
        if (active) {
          setUsers(payload.filter((user) => user.isActive));
        }
      } catch (caughtError) {
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load demo users.");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function signIn(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/auth/demo-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (!response.ok) {
          throw new Error(`Sign-in failed (${response.status}).`);
        }
        const payload = authTokenResponseSchema.parse(await response.json());
        setClientAccessToken(payload.accessToken);
        router.push(redirectTo);
        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to sign in.");
      }
    });
  }

  return (
    <div className="workspace fade-up">
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="kicker">Sign in</span>
          <h1>Choose a demo identity to enter the workflow control plane.</h1>
          <p>
            This demo uses backend-issued JWT sessions backed by the seeded user directory, so each lane sees only the
            cases and queues allowed by its role.
          </p>
          {error ? <p className="text-danger">{error}</p> : null}
        </div>

        <div className="hero-visual fade-up-delay">
          <div className="hero-panel hero-panel-dark">
            <div className="metric-head">
              <div>
                <p className="eyebrow">Demo identities</p>
                <h2>Choose the walkthrough lane</h2>
              </div>
              <span className="inline-status">{users.length} available</span>
            </div>
            <div className="activity-list">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={getRoleCardClass(user.id)}
                  disabled={isPending}
                  onClick={() => signIn(user.id)}
                >
                  <div className="login-role-head">
                    <strong>{user.displayName}</strong>
                    <span className={getRoleBadgeClass(user.id)}>{user.roles.join(", ")}</span>
                  </div>
                  <p className="login-role-copy">{getRoleSummary(user)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
