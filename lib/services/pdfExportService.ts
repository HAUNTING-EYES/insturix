// PDFExportService for rich text script content
// This service converts HTML rich text to formatted PDFs

export interface ScriptMetadata {
  title: string;
  duration?: string;
  targetAudience?: string;
  tone?: string;
  generatedAt?: Date;
}

export class PDFExportService {
  private static instance: PDFExportService;

  public static getInstance(): PDFExportService {
    if (!PDFExportService.instance) {
      PDFExportService.instance = new PDFExportService();
    }
    return PDFExportService.instance;
  }

  /**
   * Export rich text HTML content to PDF
   * Uses Puppeteer approach for better formatting
   */
  async exportToPDF(
    htmlContent: string, 
    metadata: ScriptMetadata,
    options: {
      filename?: string;
      includeMetadata?: boolean;
      format?: 'A4' | 'Letter';
    } = {}
  ): Promise<void> {
    const {
      filename = `${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_script.pdf`,
      includeMetadata = true,
    } = options;

    try {
      // Create a complete HTML document for PDF generation
      const fullHtml = this.createFullHTMLDocument(htmlContent, metadata, includeMetadata);
      
      // Use the browser's print functionality for better results
      await this.exportUsingPrint(fullHtml);
      
    } catch (error) {
      console.error('PDF export failed:', error);
      // Fallback to simple text export
      this.exportAsText(htmlContent, metadata.title);
    }
  }

  /**
   * Create a complete HTML document with styling for PDF export
   */
  private createFullHTMLDocument(
    content: string, 
    metadata: ScriptMetadata, 
    includeMetadata: boolean
  ): string {
    const metadataSection = includeMetadata ? `
      <div class="metadata">
        <h1 class="document-title">${metadata.title}</h1>
        ${metadata.duration ? `<p><strong>Duration:</strong> ${metadata.duration}</p>` : ''}
        ${metadata.targetAudience ? `<p><strong>Target Audience:</strong> ${metadata.targetAudience}</p>` : ''}
        ${metadata.tone ? `<p><strong>Tone:</strong> ${metadata.tone}</p>` : ''}
        <p><strong>Generated:</strong> ${metadata.generatedAt?.toLocaleDateString() || new Date().toLocaleDateString()}</p>
        <hr style="margin: 20px 0; border: 1px solid #ddd;">
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${metadata.title}</title>
          <style>
            @page {
              margin: 1in;
              size: A4;
            }
            body {
              font-family: 'Georgia', 'Times New Roman', serif;
              line-height: 1.6;
              color: #333;
              max-width: none;
              margin: 0;
              padding: 0;
              background: white;
            }
            .metadata {
              margin-bottom: 30px;
              padding-bottom: 20px;
            }
            .document-title {
              font-size: 24px;
              margin-bottom: 10px;
              color: #2c3e50;
            }
            h1 {
              font-size: 22px;
              color: #2c3e50;
              margin: 25px 0 15px 0;
              page-break-after: avoid;
            }
            h2 {
              font-size: 18px;
              color: #34495e;
              margin: 20px 0 12px 0;
              page-break-after: avoid;
            }
            h3 {
              font-size: 16px;
              color: #34495e;
              margin: 15px 0 10px 0;
              page-break-after: avoid;
            }
            p {
              margin: 10px 0;
              text-align: justify;
              orphans: 3;
              widows: 3;
            }
            strong {
              color: #2c3e50;
            }
            em {
              font-style: italic;
            }
            ul, ol {
              margin: 15px 0;
              padding-left: 30px;
            }
            li {
              margin: 5px 0;
            }
            blockquote {
              margin: 20px 0;
              padding: 15px 20px;
              background: #f8f9fa;
              border-left: 4px solid #e74c3c;
              font-style: italic;
              page-break-inside: avoid;
            }
            .page-break {
              page-break-before: always;
            }
            @media print {
              body {
                font-size: 12pt;
              }
              h1 { font-size: 18pt; }
              h2 { font-size: 16pt; }
              h3 { font-size: 14pt; }
            }
          </style>
        </head>
        <body>
          ${metadataSection}
          <div class="content">
            ${content}
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Export using browser's print functionality
   */
  private async exportUsingPrint(htmlContent: string): Promise<void> {
    // Create a new window/iframe for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Could not open print window');
    }

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for content to load
    await new Promise(resolve => {
      printWindow.onload = resolve;
      setTimeout(resolve, 1000); // Fallback timeout
    });

    // Trigger print dialog
    printWindow.print();
    
    // Close the window after printing
    setTimeout(() => {
      printWindow.close();
    }, 1000);
  }

  /**
   * Fallback: Export as plain text
   */
  private exportAsText(htmlContent: string, title: string): void {
    // Strip HTML tags and convert to plain text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const textContent = tempDiv.innerText || tempDiv.textContent || '';

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_script.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Export using html2pdf library (if available)
   * This requires installing html2pdf.js: npm install html2pdf.js
   */
  async exportUsingHtml2PDF(
    htmlContent: string, 
    metadata: ScriptMetadata
  ): Promise<void> {
    try {
      // Check if html2pdf is available in the global scope or as a module
      // @ts-expect-error - Optional dependency, may not be available
      const html2pdf = await import('html2pdf.js').catch(() => null);
      
      if (!html2pdf) {
        throw new Error('html2pdf.js not installed. Please install it with: npm install html2pdf.js');
      }
      
      const fullHtml = this.createFullHTMLDocument(htmlContent, metadata, true);
      const element = document.createElement('div');
      element.innerHTML = fullHtml;
      
      const options = {
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `${metadata.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_script.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
      };

      await (html2pdf as any).default().set(options).from(element).save();
      
    } catch (error) {
      console.error('html2pdf export failed:', error);
      throw error;
    }
  }
}

export const pdfExportService = PDFExportService.getInstance(); 