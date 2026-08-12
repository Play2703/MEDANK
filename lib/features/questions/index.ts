/**
 * Feature: Questions (Banco de Questões Médicas)
 * Modular architecture definition for Medical Exam Questions feature.
 */
export interface QuestionsFeatureConfig {
  enabled: boolean;
  totalQuestionsCount: number;
}

export const QuestionsFeature: QuestionsFeatureConfig = {
  enabled: true,
  totalQuestionsCount: 0,
};
