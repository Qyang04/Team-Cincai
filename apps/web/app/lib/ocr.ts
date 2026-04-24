export type OcrInput = Blob | File;

function normalizeOcrText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export class TesseractOcrService {
  async extractStrings(images: readonly OcrInput[]): Promise<string[]> {
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

  async extractJoinedText(images: readonly OcrInput[]): Promise<string> {
    const texts = await this.extractStrings(images);
    return texts.join(",");
  }
}

export async function extractJoinedOcrText(images: readonly OcrInput[]): Promise<string> {
  const service = new TesseractOcrService();
  return service.extractJoinedText(images);
}
