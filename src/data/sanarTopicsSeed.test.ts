import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  BASIC_CYCLE_SPECIALTIES,
  CLINICAL_CYCLE_SPECIALTIES,
} from './curriculumTopics';

describe('sanarTopicsSeed - Validação de Extração e Mapeamento de Tópicos do Sanar', () => {
  const seedPath = path.resolve(process.cwd(), 'src/data/sanarTopicsSeed.json');
  const allMedAnkiSpecialties = new Set([
    ...BASIC_CYCLE_SPECIALTIES,
    ...CLINICAL_CYCLE_SPECIALTIES,
  ]);

  it('deve existir o arquivo src/data/sanarTopicsSeed.json e ser um JSON válido', () => {
    expect(fs.existsSync(seedPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    expect(typeof content).toBe('object');
    expect(Object.keys(content).length).toBeGreaterThan(20);
  });

  it('todas as especialidades mapeadas devem pertencer às especialidades oficiais do MedAnki', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    for (const specialty of Object.keys(content)) {
      expect(allMedAnkiSpecialties.has(specialty)).toBe(true);
    }
  });

  it('não deve conter Biofísica, Bioestatística (isolada) ou Eletrocardiograma (ECG)', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    expect(content['Biofísica']).toBeUndefined();
    expect(content['Bioestatística']).toBeUndefined();
    expect(content['Eletrocardiograma (ECG)']).toBeUndefined();
    expect(content['Eletrocardiograma']).toBeUndefined();
  });

  it('deve unificar temas de Farmacologia em Farmacologia Básica', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    expect(content['Farmacologia Clínica']).toBeUndefined();
    expect(content['Farmacologia Básica']).toBeDefined();
    expect(content['Farmacologia Básica'].length).toBeGreaterThan(50);
  });

  it('deve manter Genética Médica no Ciclo Básico com os temas importados', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    expect(content['Genética Médica']).toBeDefined();
    expect(content['Genética Médica'].length).toBeGreaterThan(10);
    expect(BASIC_CYCLE_SPECIALTIES).toContain('Genética Médica');
  });

  it('deve mapear corretamente Cirurgia Geral e as subespecialidades cirúrgicas com especialidade própria', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    expect(content['Ortopedia e Traumatologia']).toBeDefined();
    expect(content['Oftalmologia']).toBeDefined();
    expect(content['Otorrinolaringologia']).toBeDefined();
    expect(content['Urologia']).toBeDefined();
    expect(content['Cirurgia Geral']).toBeDefined();
    expect(content['Cirurgia Geral'].length).toBeGreaterThan(50);
  });

  it('não deve conter temas duplicados dentro da mesma especialidade nem strings vazias', () => {
    const content: Record<string, string[]> = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    for (const [specialty, topics] of Object.entries(content)) {
      expect(Array.isArray(topics)).toBe(true);
      const set = new Set(topics);
      expect(set.size).toBe(topics.length);
      for (const topic of topics) {
        expect(topic.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
