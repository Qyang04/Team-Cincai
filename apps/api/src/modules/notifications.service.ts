import { Injectable } from "@nestjs/common";
import { TelemetryService } from "./telemetry.service";

type NotificationPayload = {
  type: string;
  recipientId: string;
  subject: string;
  body: string;
  caseId?: string;
};

@Injectable()
export class NotificationsService {
  private readonly useMockNotifications = (process.env.USE_MOCK_NOTIFICATIONS ?? "true").toLowerCase() !== "false";

  constructor(private readonly telemetry: TelemetryService) {}

  async send(payload: NotificationPayload) {
    this.telemetry.increment("notifications.sent");
    this.telemetry.mark("notifications.lastSentAt");

    if (this.useMockNotifications) {
      return {
        channel: "mock",
        delivered: true,
        ...payload,
      };
    }

    return {
      channel: "stub",
      delivered: false,
      ...payload,
    };
  }
}

