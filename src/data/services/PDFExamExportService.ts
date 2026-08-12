/**
 * Client-Side PDF Exam Export Client Service
 *
 * Communicates with the backend server-side PDF generator (/api/export-pdf)
 * to receive a 100% vector-rendered PDF Blob and handles clean native file downloads
 * on Web and Capacitor/iOS mobile platforms.
 */

import { QuestionSet } from '../../domain/entities/Question';
import { apiUrl } from '../../lib/apiBaseUrl';

export class PDFExamExportService {
  /**
   * Triggers server-side PDF rendering for a QuestionSet and downloads the resulting file.
   */
  public static async exportToPDF(questionSet: QuestionSet): Promise<void> {
    if (!questionSet || !questionSet.questions || questionSet.questions.length === 0) {
      throw new Error('Nenhum simulado válido fornecido para exportação.');
    }

    const response = await fetch(apiUrl('/api/export-pdf'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(questionSet),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error || errJson.details || `Falha na geração do PDF (${response.status})`);
    }

    const blob = await response.blob();
    const fileName = `${(questionSet.title || 'Simulado_MedAnki')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/gi, '')
      .replace(/\s+/g, '_')}.pdf`;

    // Check if running inside native Capacitor (iOS/Android)
    const isCapacitor =
      typeof window !== 'undefined' &&
      Boolean((window as any).Capacitor && (window as any).Capacitor.isNativePlatform && (window as any).Capacitor.isNativePlatform());

    if (isCapacitor) {
      try {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64Data = reader.result as string;
          // Attempt native Capacitor Filesystem & Share if available
          const Plugins = (window as any).Capacitor?.Plugins;
          if (Plugins?.Filesystem && Plugins?.Share) {
            const savedFile = await Plugins.Filesystem.writeFile({
              path: fileName,
              data: base64Data.split(',')[1],
              directory: 'CACHE',
            });
            await Plugins.Share.share({
              title: questionSet.title || 'Simulado PDF',
              url: savedFile.uri,
            });
            return;
          }

          // Fallback native opening
          const a = document.createElement('a');
          a.href = base64Data;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        };
        return;
      } catch (capErr) {
        console.warn('[PDFExamExportService] Native Capacitor export fallback:', capErr);
      }
    }

    // Standard Browser Client Download
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  }
}
