import { ImportedFile } from '../../domain/entities/DocumentImport';

export class DocumentPickerService {
  private allowedExtensions = [
    'pdf',
    'docx',
    'pptx',
    'txt',
    'md',
    'markdown',
    'jpg',
    'jpeg',
    'png',
    'webp',
    'heic',
  ];

  public getAcceptAttribute(): string {
    return '.pdf,.docx,.pptx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic,application/pdf';
  }

  public isFileSupported(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return this.allowedExtensions.includes(ext);
  }

  public formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  public determineFileType(file: File): ImportedFile['type'] {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'pptx') return 'pptx';
    if (ext === 'txt') return 'txt';
    if (ext === 'md' || ext === 'markdown') return 'md';
    return 'image';
  }

  public createImportedFile(file: File): ImportedFile {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const type = this.determineFileType(file);

    // Rough page count estimation where applicable
    let estimatedPages: number | undefined = undefined;
    if (type === 'pdf') {
      // rough estimate: ~50KB per page
      estimatedPages = Math.max(1, Math.round(file.size / (50 * 1024)));
    } else if (type === 'docx' || type === 'pptx') {
      estimatedPages = Math.max(1, Math.round(file.size / (40 * 1024)));
    } else if (type === 'image') {
      estimatedPages = 1;
    }

    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      formattedSize: this.formatFileSize(file.size),
      extension: ext,
      type,
      pageCount: estimatedPages,
      status: 'pending',
      progress: 0,
    };
  }

  public selectFilesFromDevice(): Promise<File[]> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = this.getAcceptAttribute();

      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files) {
          const files = Array.from(target.files).filter((f) => this.isFileSupported(f));
          resolve(files);
        } else {
          resolve([]);
        }
      };

      input.click();
    });
  }
}
