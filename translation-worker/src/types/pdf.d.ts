declare module 'pdfjs-dist/build/pdf.js' {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFPageProxy {
    getTextContent(): Promise<TextContent>;
    getViewport(params: { scale: number }): PDFPageViewport;
    render(params: {
      canvasContext: CanvasRenderingContext2D;
      viewport: PDFPageViewport;
    }): { promise: Promise<void> };
  }

  export interface PDFPageViewport {
    width: number;
    height: number;
  }

  export interface TextContent {
    items: Array<{ str: string }>;
  }

  export interface GetDocumentParams {
    data?: Buffer;
    isEvalSupported?: boolean;
    useSystemFonts?: boolean;
  }

  export interface GlobalWorkerOptions {
    workerSrc: string;
  }

  export function getDocument(params: GetDocumentParams): {
    promise: Promise<PDFDocumentProxy>;
  };

  export const GlobalWorkerOptions: GlobalWorkerOptions;
} 