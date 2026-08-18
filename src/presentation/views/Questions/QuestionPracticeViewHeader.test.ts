import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('QuestionPracticeView Header Responsiveness and PDF Button Labels', () => {
  const filePath = path.resolve(process.cwd(), 'src/presentation/views/Questions/QuestionPracticeView.tsx');
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  it('TAREFA 1: O botão de PDF deve conter o texto encurtado "PDF", sem emoji redundante e com title/aria-label descritivos', () => {
    // Confirma que o texto longo anterior foi substituído
    expect(fileContent).not.toContain('📄 Exportar Simulado em PDF (Padrão Oficial)');

    // Confirma texto "PDF"
    expect(fileContent).toMatch(/>\s*PDF\s*<\/M3Button>/);

    // Confirma title e aria-label para acessibilidade e tooltip
    expect(fileContent).toContain('title="Exportar Simulado em PDF (Padrão Oficial)"');
    expect(fileContent).toContain('aria-label="Exportar Simulado em PDF (Padrão Oficial)"');
  });

  it('TAREFA 2: Deve utilizar isMobileViewport para adaptação de layout responsivo', () => {
    // Confirma import/uso do hook de responsividade
    expect(fileContent).toContain('const { colors, isMobileViewport } = useDevice();');

    // Confirma layout flex-col no mobile e items-center justify-between no desktop
    expect(fileContent).toContain("${isMobileViewport ? 'flex-col gap-3' : 'items-center justify-between gap-4'}");

    // Confirma flex-wrap no container de botões em mobile
    expect(fileContent).toContain("${isMobileViewport ? 'w-full justify-end flex-wrap' : 'shrink-0'}");
  });
});
