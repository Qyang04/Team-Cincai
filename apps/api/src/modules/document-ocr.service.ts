import { Injectable } from "@nestjs/common";

function normalizeOcrText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

@Injectable()
export class DocumentOcrService {
  async extractStrings(images: readonly Buffer[]): Promise<string[]> {
    if (!images.length) {
      return [];
    }

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    try {
      const texts: string[] = [];

      for (const image of images) {
        const {
          data: { text },
        } = await worker.recognize(image);

        const normalized = normalizeOcrText(text);
        if (normalized) {
          texts.push(normalized);
        }
      }

      return texts;
    } finally {
      await worker.terminate();
    }
  }

  async extractJoinedText(images: readonly Buffer[]): Promise<string> {
    const texts = await this.extractStrings(images);
    return texts.join(",");
  }
}
