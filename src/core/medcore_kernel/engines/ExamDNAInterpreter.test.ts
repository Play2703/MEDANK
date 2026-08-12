import { describe, it, expect } from 'vitest';
import { interpretExamDNA } from './ExamDNAInterpreter';
import { ExamDNA } from '../../../domain/entities/Question';

describe('ExamDNAInterpreter - interpretExamDNA', () => {
  it('deve formatar corretamente as instruções de um DNA com eixos de Ciclo Clínico', () => {
    const dna: ExamDNA = {
      cicloAcademico: 'clinico',
      clinico: {
        contextoClinico: 0.85,
        casosLongos: 0.70,
        pegadinhas: 0.60,
        epidemiologia: 0.20,
        farmacologia: 0.50,
        achadosDeImagem: 0.15,
        condutaImediata: 0.90,
        diretrizesOficiais: 0.80,
        comorbidadesMultiplas: 0.40,
      },
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    const text = interpretExamDNA(dna);

    expect(text).toContain('=== DNA CALIBRADO DA BANCA/PROFESSOR (ciclo: clinico, baseado em 1 análise(s) do acervo importado) ===');
    expect(text).toContain('-- Eixos de Ciclo Clínico --');
    expect(text).toContain('- SEMPRE inclua, com prioridade alta: uso de vinhetas clínicas (em vez de perguntas conceituais diretas) (peso calibrado: 0.85)');
    expect(text).toContain('- evite/praticamente não explore: dados epidemiológicos e estatísticos (peso calibrado: 0.20)');
    expect(text).not.toContain('detalhes farmacológicos específicos'); // neutral zone (0.50) is filtered out
  });

  it('deve formatar corretamente um DNA do Ciclo Básico', () => {
    const dna: ExamDNA = {
      cicloAcademico: 'basico',
      basico: {
        memorizacaoDireta: 0.80,
        correlacaoAnatomoclinica: 0.60,
        nomenclaturaTecnica: 0.90,
        mecanismoFisiopatologico: 0.75,
        reconhecimentoEstrutural: 0.30,
        integracaoMultissistemica: 0.20,
        basesBioquimicas: 0.50,
      },
      version: 2,
      updatedAt: new Date().toISOString(),
    };

    const text = interpretExamDNA(dna);

    expect(text).toContain('ciclo: basico');
    expect(text).toContain('-- Eixos de Ciclo Básico --');
    expect(text).toContain('cobrança de definição/nomenclatura direta');
    expect(text).toContain('precisão de termos técnicos/latinos/epônimos');
  });

  it('deve formatar um DNA do tipo misto com seções clínica e básica separadas', () => {
    const dna: ExamDNA = {
      cicloAcademico: 'misto',
      clinico: {
        contextoClinico: 0.80,
        casosLongos: 0.60,
        pegadinhas: 0.50,
        epidemiologia: 0.30,
        farmacologia: 0.40,
        achadosDeImagem: 0.20,
        condutaImediata: 0.70,
        diretrizesOficiais: 0.60,
        comorbidadesMultiplas: 0.30,
      },
      basico: {
        memorizacaoDireta: 0.70,
        correlacaoAnatomoclinica: 0.50,
        nomenclaturaTecnica: 0.80,
        mecanismoFisiopatologico: 0.60,
        reconhecimentoEstrutural: 0.40,
        integracaoMultissistemica: 0.30,
        basesBioquimicas: 0.40,
      },
      version: 3,
      updatedAt: new Date().toISOString(),
    };

    const text = interpretExamDNA(dna);

    expect(text).toContain('-- Eixos de Ciclo Clínico --');
    expect(text).toContain('-- Eixos de Ciclo Básico --');
  });
});
