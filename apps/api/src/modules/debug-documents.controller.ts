import { BadRequestException, Controller, NotFoundException, Post, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { isDebugModeEnabled } from "./debug-mode";
import { DocumentOcrService } from "./document-ocr.service";
import { PdfTextExtractionService } from "./pdf-text-extraction.service";
import { Public } from "./public.decorator";

type UploadedDebugFile = {
  buffer: Buffer;
};

@Controller("debug/documents")
@Public()
export class DebugDocumentsController {
  constructor(
    private readonly documentOcrService: DocumentOcrService,
    private readonly pdfTextExtractionService: PdfTextExtractionService,
  ) {}

  private assertDebugModeEnabled() {
    if (!isDebugModeEnabled()) {
      throw new NotFoundException("Debug mode is disabled.");
    }
  }

  @Post("ocr")
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async extractOcr(@UploadedFiles() files: UploadedDebugFile[] | undefined) {
    this.assertDebugModeEnabled();

    if (!files?.length) {
      throw new BadRequestException('Missing file bodies (multipart field name must be "files").');
    }

    const texts = await this.documentOcrService.extractStrings(files.map((file) => file.buffer));
    return {
      texts,
      joinedText: texts.join(","),
    };
  }

  @Post("pdf-text")
  @UseInterceptors(
    FilesInterceptor("files", 10, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async extractPdfText(@UploadedFiles() files: UploadedDebugFile[] | undefined) {
    this.assertDebugModeEnabled();

    if (!files?.length) {
      throw new BadRequestException('Missing file bodies (multipart field name must be "files").');
    }

    const texts = await this.pdfTextExtractionService.extractStrings(files.map((file) => file.buffer));
    return {
      texts,
      joinedText: texts.join(","),
    };
  }
}
