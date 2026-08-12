/**
 * Feature: Simulados (Exames & Provas de Residência)
 * Modular architecture definition for Exam Simulations.
 */
export interface SimuladosFeatureConfig {
  enabled: boolean;
  timeLimitMinutes: number;
}

export const SimuladosFeature: SimuladosFeatureConfig = {
  enabled: true,
  timeLimitMinutes: 240,
};
