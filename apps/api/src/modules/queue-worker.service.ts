import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { JobRunnerService } from "./job-runner.service";
import { queueNames, type QueueName } from "./queue.constants";

@Injectable()
export class QueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly queueMode = process.env.QUEUE_MODE ?? "inline";
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly redis =
    this.queueMode === "bullmq" && this.redisUrl ? new IORedis(this.redisUrl, { maxRetriesPerRequest: null }) : null;
  private readonly workers: Worker[] = [];

  constructor(private readonly jobRunner: JobRunnerService) {}

  async onModuleInit() {
    if (!this.redis) {
      return;
    }

    const activeQueues: QueueName[] = [
      queueNames.artifactProcessing,
      queueNames.aiIntake,
      queueNames.policyEvaluation,
      queueNames.exportProcessing,
    ];

    for (const queueName of activeQueues) {
      const worker = new Worker(
        queueName,
        async (job) => this.jobRunner.runRegisteredHandler(queueName, job.data),
        { connection: this.redis },
      );
      this.workers.push(worker);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    if (this.redis) {
      await this.redis.quit();
    }
  }
}
