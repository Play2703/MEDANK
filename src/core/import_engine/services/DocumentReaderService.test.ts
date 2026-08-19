import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { DocumentReaderService } from './DocumentReaderService';

describe('DocumentReaderService - EPUB Parsing', () => {
  const service = new DocumentReaderService();

  it('detectFormat - deve detectar formato EPUB corretamente', () => {
    const file = new File([''], 'livro_medico.epub', { type: 'application/epub+zip' });
    expect(service.detectFormat(file)).toBe('epub');
  });

  it('readContent (EPUB) - deve extrair capítulos na ordem do spine sem tags HTML', async () => {
    const zip = new JSZip();

    // 1. META-INF/container.xml
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
    );

    // 2. OEBPS/content.opf com manifest e spine
    zip.file(
      'OEBPS/content.opf',
      `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="2.0">
  <manifest>
    <item id="chap2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="chap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chap1"/>
    <itemref idref="chap2"/>
  </spine>
</package>`
    );

    // 3. Arquivos de capítulos
    zip.file(
      'OEBPS/cap1.xhtml',
      `<html><head><style>body { color: red; }</style></head><body><h1>Capítulo 1</h1><p>Introdução à <b>Cardiologia</b> clínica.</p></body></html>`
    );
    zip.file(
      'OEBPS/cap2.xhtml',
      `<html><body><h1>Capítulo 2</h1><p>Insuficiência Cardíaca Congestiva (ICC) &amp; manejo de diuréticos.</p></body></html>`
    );

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const file = new File([zipBuffer], 'livro.epub', { type: 'application/epub+zip' });

    const content = await service.readContent(file);

    expect(content.format).toBe('epub');
    expect(content.rawText).toBeDefined();

    const text = content.rawText!;

    // Verifica se os capítulos foram extraídos exatamente na ordem do spine (cap1 antes de cap2)
    const posCap1 = text.indexOf('Capítulo 1');
    const posCap2 = text.indexOf('Capítulo 2');

    expect(posCap1).toBeGreaterThan(-1);
    expect(posCap2).toBeGreaterThan(-1);
    expect(posCap1).toBeLessThan(posCap2);

    // Verifica remoção de tags HTML/CSS e decodificação de entidades
    expect(text).not.toContain('<style>');
    expect(text).not.toContain('<h1>');
    expect(text).not.toContain('<b>');
    expect(text).toContain('Insuficiência Cardíaca Congestiva (ICC) & manejo de diuréticos.');
  });

  it('readContent (EPUB) - deve acionar fallback para extractRawStringsFromBuffer em arquivo corrompido', async () => {
    // Buffer binário aleatório (inválido como zip)
    const corruptBuffer = new Uint8Array([0x45, 0x50, 0x55, 0x42, 0x20, 0x54, 0x45, 0x53, 0x54, 0x20, 0x44, 0x41, 0x54, 0x41]);
    const file = new File([corruptBuffer.buffer], 'corrupto.epub', { type: 'application/epub+zip' });

    const content = await service.readContent(file);

    expect(content.format).toBe('epub');
    expect(content.byteLength).toBe(corruptBuffer.byteLength);
    // Não deve lançar exceção, deve ter acionado o fallback
  });

  it('readContent (EPUB) - arquivo maior que 15MB deve pular extração real e usar guarda de tamanho', async () => {
    // Simula buffer com mais de 15MB
    const LARGE_SIZE = 15 * 1024 * 1024 + 100;
    const largeBuffer = new ArrayBuffer(LARGE_SIZE);
    const file = new File([largeBuffer], 'livro_gigante.epub', { type: 'application/epub+zip' });

    const content = await service.readContent(file);

    expect(content.format).toBe('epub');
    expect(content.byteLength).toBe(LARGE_SIZE);
  });

  describe('PDF Inspection & Scanned Document Detection', () => {
    it('inspectPDF - deve identificar arquivo corrompido/vazio como scannedPdf', async () => {
      const emptyBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer; // "%PDF"
      const inspection = await service.inspectPDF(emptyBuffer);

      expect(inspection).toBeDefined();
      expect(inspection.isScannedPdf).toBe(true);
      expect(inspection.textItemsCount).toBe(0);
    });

    it('detectFormat - deve detectar PDF e imagens corretamente', () => {
      const pdfFile = new File([''], 'prova.pdf', { type: 'application/pdf' });
      const imgFile = new File([''], 'escaner.png', { type: 'image/png' });

      expect(service.detectFormat(pdfFile)).toBe('pdf');
      expect(service.detectFormat(imgFile)).toBe('image');
    });
  });
});
