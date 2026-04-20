import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue, QueueEvents, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import type { QueueName } from "./queue.constants";

type QueueHandler<TPayload = unknown, TResult = unknown> = (payload: TPayload) => Promise<TResult>;

@Injectable()
export class JobRunnerService implements OnModuleDestroy {
  private readonly queueMode = process.env.QUEUE_MODE ?? "inline";
  private readonly redisUrl = process.env.REDIS_URL;
  private readonly redis =
    this.queueMode === "bullmq" && this.redisUrl ? new IORedis(this.redisUrl, { maxRetriesPerRequest: null }) : null;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly queueEvents = new Map<QueueName, QueueEvents>();
  private readonly handlers = new Map<QueueName, QueueHandler>();

  registerHandler<TPayload, TResult>(queueName: QueueName, handler: QueueHandler<TPayload, TResult>) {
    this.handlers.set(queueName, handler as QueueHandler);
  }

  async runRegisteredHandler<TPayload, TResult>(queueName: QueueName, payload: TPayload): Promise<TResult> {
    const handler = this.handlers.get(queueName);
    if (!handler) {
      throw new Error(`No queue handler registered for ${queueName}`);
    }

    return handler(payload) as Promise<TResult>;
  }

  private getQueue(name: QueueName) {
    if (!this.redis) {
      return null;
    }
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }
    const queue = new Queue(name, { connection: this.redis });
    this.queues.set(name, queue);
    return queue;
  }

  private getQueueEvents(name: QueueName) {
    if (!this.redis) {
      return null;
    }
    const existing = this.queueEvents.get(name);
    if (existing) {
      return existing;
    }
    const events = new QueueEvents(name, { connection: this.redis });
    this.queueEvents.set(name, events);
    return events;
  }

  async dispatch<TPayload, TResult>(
    queueName: QueueName,
    jobName: string,
    payload: TPayload,
    options?: JobsOptions,
  ): Promise<TResult> {
    if (this.queueMode !== "bullmq") {
      return this.runRegisteredHandler<TPayload, TResult>(queueName, payload);
    }

    const queue = this.getQueue(queueName);
    const events = this.getQueueEvents(queueName);

    if (!queue || !events) {
      return this.runRegisteredHandler<TPayload, TResult>(queueName, payload);
    }

    const job = await queue.add(jobName, payload as object, {
      removeOnComplete: true,
      removeOnFail: 20,
      ...options,
    });

    const result = await job.waitUntilFinished(events);
    return result as TResult;
  }

  async onModuleDestroy() {
    await Promise.all([...this.queueEvents.values()].map((events) => events.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

