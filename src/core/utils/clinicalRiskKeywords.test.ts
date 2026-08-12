import { describe, it, expect } from 'vitest';
import { containsClinicalRiskKeywords } from './clinicalRiskKeywords';

describe('containsClinicalRiskKeywords (K1 Specialty Expansion Test Suite)', () => {
  // Categorias Legadas (F1)
  describe('Categorias Genéricas Legadas (F1)', () => {
    it('detecta dose e posologia', () => {
      expect(containsClinicalRiskKeywords('Dose de ataque 500mg VO')).toBe(true);
      expect(containsClinicalRiskKeywords('Alterar posologia para 12 em 12h')).toBe(true);
    });

    it('detecta contraindicações e alérgenos', () => {
      expect(containsClinicalRiskKeywords('Contraindicado em pacientes com anafilaxia a AINEs')).toBe(true);
      expect(containsClinicalRiskKeywords('Não usar em gestantes no primeiro trimestre')).toBe(true);
    });

    it('detecta via e populações especiais', () => {
      expect(containsClinicalRiskKeywords('Administração via oral após refeição')).toBe(true);
      expect(containsClinicalRiskKeywords('Ajuste de dose na insuficiência renal grave')).toBe(true);
    });
  });

  // Novas Categorias da Tarefa K1
  describe('1. Classes Farmacológicas e Nomenclaturas (K1)', () => {
    it('detecta beta-bloqueador e anticoagulante', () => {
      expect(containsClinicalRiskKeywords('Iniciar beta-bloqueador se frequência cardíaca > 60 bpm')).toBe(true);
      expect(containsClinicalRiskKeywords('Manter anticoagulante por 3 meses pós-TEV')).toBe(true);
    });

    it('detecta IECA, antiagregante e vasopressor', () => {
      expect(containsClinicalRiskKeywords('Substituir IECA por BRA se ocorrer tosse seca')).toBe(true);
      expect(containsClinicalRiskKeywords('Adicionar antiagregante plaquetário duplo')).toBe(true);
      expect(containsClinicalRiskKeywords('Desmame de vasopressor em choque séptico')).toBe(true);
    });
  });

  describe('2. Farmacocinética e Farmacodinâmica (K1)', () => {
    it('detecta meia-vida e janela terapêutica', () => {
      expect(containsClinicalRiskKeywords('Fármaco possui meia-vida longa de eliminação')).toBe(true);
      expect(containsClinicalRiskKeywords('Digoxina apresenta janela terapêutica estreita')).toBe(true);
    });

    it('detecta clearance e metabolização hepática', () => {
      expect(containsClinicalRiskKeywords('Medir clearance de creatinina antes da prescrição')).toBe(true);
      expect(containsClinicalRiskKeywords('Risco de acúmulo por metabolização hepática reduzida')).toBe(true);
    });
  });

  describe('3. Protocolos Clínicos e Condutas Diretas (K1)', () => {
    it('detecta primeira linha e droga de escolha', () => {
      expect(containsClinicalRiskKeywords('Metformina é a primeira linha no tratamento do DM2')).toBe(true);
      expect(containsClinicalRiskKeywords('Penicilina G benzatina é a droga de escolha na sífilis')).toBe(true);
    });

    it('detecta conduta imediata e manejo inicial', () => {
      expect(containsClinicalRiskKeywords('Conduta imediata: reanimação volêmica com cristaloide')).toBe(true);
      expect(containsClinicalRiskKeywords('Manejo inicial do politraumatizado segundo o ATLS')).toBe(true);
    });
  });

  describe('4. Escores de Gravidade e Decisão Crítica (K1)', () => {
    it('detecta escore de risco e critério de gravidade', () => {
      expect(containsClinicalRiskKeywords('Avaliar escore de risco CHA2DS2-VASc na fibrilação atrial')).toBe(true);
      expect(containsClinicalRiskKeywords('Preenche critério de gravidade para internação em UTI')).toBe(true);
    });

    it('detecta sinal de alarme e red flag', () => {
      expect(containsClinicalRiskKeywords('Presença de sinal de alarme na cefaleia súbita')).toBe(true);
      expect(containsClinicalRiskKeywords('Atenção para red flags na lombalgia aguda')).toBe(true);
    });
  });

  describe('5. Procedimentos Invasivos e Diagnósticos (K1)', () => {
    it('detecta punção e cateterismo', () => {
      expect(containsClinicalRiskKeywords('Realizar punção lombar para coleta de LCR')).toBe(true);
      expect(containsClinicalRiskKeywords('Encaminhar para cateterismo cardíaco de urgência')).toBe(true);
    });

    it('detecta intubação e sondagem', () => {
      expect(containsClinicalRiskKeywords('Indicada intubação orotraqueal por rebaixamento')).toBe(true);
      expect(containsClinicalRiskKeywords('Passagem de sondagem nasogástrica em íleo paralítico')).toBe(true);
    });
  });

  describe('Casos Negativos (Textos Médicos Neutros)', () => {
    it('não dispara para anatomia básica e fisiologia puramente descritiva', () => {
      expect(containsClinicalRiskKeywords('Qual a diferença anatômica entre artéria e veia?')).toBe(false);
      expect(containsClinicalRiskKeywords('O fígado é dividido nos lobos direito e esquerdo pelo ligamento falciforme.')).toBe(false);
      expect(containsClinicalRiskKeywords('Visão geral do ciclo cardíaco e sístole ventricular.')).toBe(false);
    });

    it('não dispara para definições conceituais sem conduta/posologia', () => {
      expect(containsClinicalRiskKeywords('Histologia do tecido epitelial pseudoestratificado ciliado.')).toBe(false);
      expect(containsClinicalRiskKeywords('Origem embriológica do sistema nervoso central a partir da crista neural.')).toBe(false);
    });
  });
});
