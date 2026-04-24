import { Injectable, OnModuleInit } from "@nestjs/common";
import { UserDirectoryService } from "./user-directory.service";

@Injectable()
export class DirectorySeedService implements OnModuleInit {
  private readonly seedDemoUsers = (process.env.SEED_DEMO_USERS ?? "true").toLowerCase() !== "false";

  constructor(private readonly userDirectoryService: UserDirectoryService) {}

  async onModuleInit() {
    if (!this.seedDemoUsers) {
      return;
    }
    await this.userDirectoryService.ensureSeedData();
  }
}
