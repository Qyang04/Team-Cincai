import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LOCAL_URI_PREFIX = "local://";

@Injectable()
export class LocalArtifactStorageService {
  private getRootDir(): string {
    return process.env.LOCAL_ARTIFACT_DIR ?? join(process.cwd(), ".local-artifacts");
  }

  sanitizeFilename(filename: string): string {
    const base = filename.replace(/\\/g, "/").split("/").pop() ?? "upload";
    return base.replace(/[^\w.\-()+ ]/g, "_").slice(0, 180) || "file";
  }

  async saveUploadedFile(caseId: string, originalFilename: string, buffer: Buffer): Promise<{ storageUri: string }> {
    const root = this.getRootDir();
    const caseDir = join(root, caseId);
    await mkdir(caseDir, { recursive: true });

    const safe = this.sanitizeFilename(originalFilename);
    const storedName = `${randomUUID()}-${safe}`;
    const absolutePath = join(caseDir, storedName);
    await writeFile(absolutePath, buffer);

    const storageUri = `${LOCAL_URI_PREFIX}${caseId}/${storedName}`;
    return { storageUri };
  }

  resolveLocalPath(storageUri: string): string | null {
    if (!storageUri.startsWith(LOCAL_URI_PREFIX)) {
      return null;
    }
    const rest = storageUri.slice(LOCAL_URI_PREFIX.length);
    const slash = rest.indexOf("/");
    if (slash < 1) {
      return null;
    }
    const caseId = rest.slice(0, slash);
    const filePart = rest.slice(slash + 1);
    if (!filePart || filePart.includes("..")) {
      return null;
    }
    return join(this.getRootDir(), caseId, filePart);
  }
}
