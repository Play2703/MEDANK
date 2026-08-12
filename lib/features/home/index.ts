/**
 * Feature: Home
 * Modular architecture definition for the Home feature.
 */
export interface HomeFeatureConfig {
  enabled: boolean;
  title: string;
}

export const HomeFeature: HomeFeatureConfig = {
  enabled: true,
  title: 'Início & Visão Geral',
};
