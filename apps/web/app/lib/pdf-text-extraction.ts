export type PdfTextInput = Blob | File;

let pdfjsLoader: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

function normalizePdfText(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function loadPdfJs() {
  pdfjsLoader ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((module) => {
    module.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
    return module;
  });

  return pdfjsLoader;
}

export class PdfTextExtractionService {
  async extractText(pdf: PdfTextInput): Promise<string> {
    const pdfjs = await loadPdfJs();
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const document = await pdfjs.getDocument({ data: bytes }).promise;

    try {
      const pageTexts: string[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = normalizePdfText(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));

        if (text) {
          pageTexts.push(text);
        }
      }

      return pageTexts.join("\n\n");
    } finally {
      await document.destroy();
    }
  }

  async extractStrings(pdfs: readonly PdfTextInput[]): Promise<string[]> {
    const texts: string[] = [];

    for (const pdf of pdfs) {
      const text = await this.extractText(pdf);
      if (text) {
        texts.push(text);
      }
    }

    return texts;
  }

  async extractJoinedText(pdfs: readonly PdfTextInput[]): Promise<string> {
    const texts = await this.extractStrings(pdfs);
    return texts.join(",");
  }
}

export async function extractJoinedPdfText(pdfs: readonly PdfTextInput[]): Promise<string> {
  const service = new PdfTextExtractionService();
  return service.extractJoinedText(pdfs);
}
