/**
 * Feature: Statistics (Analytics & Curva de Retenção)
 * Modular architecture definition for Performance Analytics.
 */
export interface StatisticsFeatureConfig {
  enabled: boolean;
  retentionTargetPercent: number;
}

export const StatisticsFeature: StatisticsFeatureConfig = {
  enabled: true,
  retentionTargetPercent: 85,
};
