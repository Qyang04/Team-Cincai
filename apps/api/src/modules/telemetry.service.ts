import { Injectable } from "@nestjs/common";

type CounterMap = Record<string, number>;

@Injectable()
export class TelemetryService {
  private readonly counters: CounterMap = {};
  private readonly timestamps: Record<string, string> = {
    startedAt: new Date().toISOString(),
  };

  increment(metric: string, amount = 1) {
    this.counters[metric] = (this.counters[metric] ?? 0) + amount;
  }

  mark(event: string) {
    this.timestamps[event] = new Date().toISOString();
  }

  snapshot() {
    return {
      counters: { ...this.counters },
      timestamps: { ...this.timestamps },
    };
  }
}

