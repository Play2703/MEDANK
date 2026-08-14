import { describe, it, expect } from 'vitest';
import {
  BASIC_CYCLE_SPECIALTIES,
  CLINICAL_CYCLE_SPECIALTIES,
  CURRICULUM_TOPICS_BY_SPECIALTY,
  SUBTOPICS_BY_TOPIC,
  getSubtopicsForTopic,
} from './curriculumTopics';

describe('curriculumTopics - SUBTOPICS_BY_TOPIC Data Model', () => {
  it('deve exportar SUBTOPICS_BY_TOPIC com as especialidades do MedAnki', () => {
    expect(SUBTOPICS_BY_TOPIC).toBeDefined();
    expect(typeof SUBTOPICS_BY_TOPIC).toBe('object');
    expect(Object.keys(SUBTOPICS_BY_TOPIC).length).toBeGreaterThan(20);
  });

  it('deve agrupar Fisiologia Respiratória sob Mecânica Ventilatória e Trocas Gasosas em Fisiologia', () => {
    const subtopics = getSubtopicsForTopic('Fisiologia', 'Mecânica Ventilatória e Trocas Gasosas');
    expect(Array.isArray(subtopics)).toBe(true);
    expect(subtopics.length).toBeGreaterThan(0);
    expect(subtopics).toContain('Fisiologia Respiratória: Ventilação, Perfusão, Relação V/Q');
    expect(subtopics).toContain('Fisiologia Respiratória: Anatomia Funcional do Sistema Respiratório');
  });

  it('deve retornar lista vazia para especialidade ou tópico inexistente sem quebrar', () => {
    expect(getSubtopicsForTopic('Especialidade Inexistente', 'Topico Inexistente')).toEqual([]);
    expect(getSubtopicsForTopic('Fisiologia', 'Topico Fantasma')).toEqual([]);
  });

  it('deve disponibilizar subtópicos para Farmacologia Básica e Cirurgia Geral', () => {
    const farmacoTopics = CURRICULUM_TOPICS_BY_SPECIALTY['Farmacologia Básica'] || [];
    let farmacoSubtopicsCount = 0;
    for (const t of farmacoTopics) {
      farmacoSubtopicsCount += getSubtopicsForTopic('Farmacologia Básica', t).length;
    }
    expect(farmacoSubtopicsCount).toBeGreaterThan(50);

    const cirurgiaTopics = CURRICULUM_TOPICS_BY_SPECIALTY['Cirurgia Geral'] || [];
    let cirurgiaSubtopicsCount = 0;
    for (const t of cirurgiaTopics) {
      cirurgiaSubtopicsCount += getSubtopicsForTopic('Cirurgia Geral', t).length;
    }
    expect(cirurgiaSubtopicsCount).toBeGreaterThan(40);
  });
});
