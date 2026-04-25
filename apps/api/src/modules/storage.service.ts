import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

@Injectable()
export class StorageService {
  prepareUpload(input: { caseId: string; filename: string; mimeType?: string }) {
    const objectKey = `cases/${input.caseId}/${randomUUID()}-${input.filename}`;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "finance-artifacts";
    return {
      provider: "supabase",
      bucket,
      objectKey,
      uploadUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/${bucket}/${objectKey}`,
      publicUrl: null,
      headers: {
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
        "content-type": input.mimeType ?? "application/octet-stream",
      },
    };
  }
}
