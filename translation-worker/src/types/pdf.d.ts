declare module 'pdfjs-dist/build/pdf.js' {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
  }

  export interface TextContent {
    items: Array<{
      str: string;
      [key: string]: any;
    }>;
  }

  export interface GetDocumentParams {
    data?: ArrayBuffer | Uint8Array;
    standardFontDataUrl?: string;
    [key: string]: any;
  }

  export interface GlobalWorkerOptions {
    workerSrc: string;
  }

  export const GlobalWorkerOptions: GlobalWorkerOptions;

  export function getDocument(params: GetDocumentParams): {
    promise: Promise<PDFDocumentProxy>;
  };
} 