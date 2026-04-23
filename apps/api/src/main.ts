import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { DEFAULT_API_PORT } from "@finance-ops/shared";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

function initializeEnvironment() {
  const candidatePaths = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(__dirname, "../../.env"),
    resolve(__dirname, "../../../.env"),
  ];

  const envPath = candidatePaths.find((candidate) => existsSync(candidate));

  if (envPath) {
    loadEnv({ path: envPath });
    return;
  }

  loadEnv();
}

initializeEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("api");
  const configuredPort = Number(process.env.PORT);
  const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_API_PORT;
  await app.listen(port);
}

void bootstrap();

