import { Injectable } from "@nestjs/common";

type PdfTextContentItem = {
  str?: string;
};

type PdfPageProxyLike = {
  getTextContent(): Promise<{
    items: PdfTextContentItem[];
  }>;
};

type PdfDocumentProxyLike = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxyLike>;
  destroy(): Promise<void>;
};

type PdfJsModuleLike = {
  getDocument(input: { data: Uint8Array }): {
    promise: Promise<PdfDocumentProxyLike>;
  };
};

let pdfjsLoader: Promise<PdfJsModuleLike> | null = null;
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<unknown>;

function normalizePdfText(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function loadPdfJs() {
  pdfjsLoader ??= dynamicImport("pdfjs-dist/legacy/build/pdf.mjs").then((module) => module as PdfJsModuleLike);
  return pdfjsLoader;
}

@Injectable()
export class PdfTextExtractionService {
  async extractText(pdf: Buffer): Promise<string> {
    const pdfjs = await loadPdfJs();
    const document = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;

    try {
      const pageTexts: string[] = [];

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = normalizePdfText(content.items.map((item: PdfTextContentItem) => item.str ?? "").join(" "));

        if (text) {
          pageTexts.push(text);
        }
      }

      return pageTexts.join("\n\n");
    } finally {
      await document.destroy();
    }
  }

  async extractStrings(pdfs: readonly Buffer[]): Promise<string[]> {
    const texts: string[] = [];

    for (const pdf of pdfs) {
      const text = await this.extractText(pdf);
      if (text) {
        texts.push(text);
      }
    }

    return texts;
  }

  async extractJoinedText(pdfs: readonly Buffer[]): Promise<string> {
    const texts = await this.extractStrings(pdfs);
    return texts.join(",");
  }
}
