export class ImportUtils {
  public static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${value} ${sizes[i]}`;
  }

  public static getMimeTypeFromExtension(extension: string): string {
    const ext = extension.replace(/^\./, '').toLowerCase();
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      txt: 'text/plain',
      md: 'text/markdown',
      epub: 'application/epub+zip',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',
      html: 'text/html',
      htm: 'text/html',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      json: 'application/json',
      csv: 'text/csv',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  public static generateImportId(): string {
    return `imp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
