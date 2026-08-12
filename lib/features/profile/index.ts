/**
 * Feature: Profile (Perfil Médico & Configurações de Estudo)
 * Modular architecture definition for User Profile & Residency Goals.
 */
export interface ProfileFeatureConfig {
  enabled: boolean;
  residencySpecialtyTarget: string;
}

export const ProfileFeature: ProfileFeatureConfig = {
  enabled: true,
  residencySpecialtyTarget: 'Residência Médica',
};
