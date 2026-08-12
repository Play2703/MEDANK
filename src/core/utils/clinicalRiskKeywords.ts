/**
 * Deterministic Clinical Risk Keyword Barrier (Fase F1 & K1)
 *
 * Scans text for terms related to sensitive clinical facts (dosages, contraindications,
 * drug interactions, routes of administration, pregnancy warnings, organ failures,
 * pharmacological classes, kinetics, protocols, risk scores, and invasive procedures).
 * Any Living Card triage recommendation containing these keywords is forcefully diverted
 * to human review (cardPendingSuggestions) instead of automatic safe_link binding.
 */

/**
 * Categorized list of clinical risk terms for auditing and extension:
 * 1. Dosage & Measurement: dose, dosagem, posologia, mg, ml, mcg, ui, g, meq
 * 2. Contraindications & Warnings: contraindicação, contraindicações, contraindicado, contraindica, não usar, não deve ser usado, evitar em, contra-indicado
 * 3. Hypersensitivity & Reactions: alergia, alergias, alergênico, hipersensibilidade, anafilaxia
 * 4. Administration Routes: via oral, intravenosa, iv, im, subcutânea, endovenosa, intramuscular
 * 5. Drug Interactions & Overdose: interação, interações, superdosagem, overdose, toxicidade
 * 6. Special Populations & Dose Adjustments: gestante, gravidez, lactante, amamentação, insuficiência renal, insuficiência hepática, ajuste de dose
 * 7. Pharmacological Classes & Nomenclatures (K1): beta-bloqueador, anticoagulante, antiagregante, IECA, BRA, inibidor da ECA, trombolítico, vasopressor, inotrópico, diurético de alça, estatina, corticoide, imunossupressor
 * 8. Pharmacokinetics & Dynamics (K1): meia-vida, janela terapêutica, clearance, biodisponibilidade, metabolização hepática, eliminação renal, pico plasmático
 * 9. Direct Clinical Protocols & Conducts (K1): primeira linha, segunda linha, droga de escolha, protocolo de, conduta imediata, manejo inicial, esquema terapêutico, linha de tratamento
 * 10. Severity Scores & Alarm Flags (K1): escore de risco, critério de gravidade, sinal de alarme, red flag, estratificação de risco
 * 11. Invasive Procedures & Diagnostics (K1): punção, cateterismo, intubação, sondagem, traqueostomia, toracocentese, paracentese, arteriografia
 */
const CLINICAL_RISK_PATTERNS: RegExp[] = [
  // 1. Dosage & Measurement
  /\b(doses?|dosag(em|ens)|posologi(a|as))\b/i,
  /\b\d+\s*(mg|ml|mcg|ui|g|meq)\b/i,

  // 2. Contraindications & Warnings
  /\b(contraindicaç(ão|ões)|contraindicad[oa]s?|contraindica|não\s+(deve\s+ser\s+)?usar|evitar\s+em|contra-indicad[oa]s?)\b/i,

  // 3. Hypersensitivity & Reactions
  /\b(alergi(a|as)|alergênic[oa]s?|hipersensibilidad[ee]s?|anafilaxi(a|as))\b/i,

  // 4. Administration Routes
  /\b(via\s+oral|intravenos[aa]|subcutâne[aa]|endovenos[aa]|intramuscular)\b/i,
  /\b(iv|im)\b/i,

  // 5. Drug Interactions & Overdose
  /\b(interaç(ão|ões)|superdosag(em|ens)|overdose|toxicidad[ee]s?)\b/i,

  // 6. Special Populations & Dose Adjustments
  /\b(gestantes?|gravid[ee]z|lactantes?|amamentaç(ão|ões)|insuficiênci(a|as)\s+(renal|hepática)|ajuste\s+de\s+dose)\b/i,

  // 7. Pharmacological Classes & Nomenclatures (K1)
  /\b(beta-bloqueador(es)?|anticoagulantes?|antiagregantes?|ieca|bras?|inibidor(es)?\s+da\s+eca|trombolíticos?|vasopressor(es)?|inotrópicos?|diuréticos?\s+de\s+alça|estatinas?|corticoides?|imunossupressores?)\b/i,

  // 8. Pharmacokinetics & Dynamics (K1)
  /\b(meia-vida(\s+de\s+eliminação)?|janela\s+terapêutica|clearance|biodisponibilidad[ee]|metabolizaçã[oo]\s+hepática|eliminaçã[oo]\s+renal|pico\s+plasmático)\b/i,

  // 9. Direct Clinical Protocols & Conducts (K1)
  /\b(primeira\s+linha|segunda\s+linha|droga\s+de\s+escolha|protocolo\s+de|conduta\s+imediata|manejo\s+inicial|esquema\s+terapêutico|linha\s+de\s+tratamento)\b/i,

  // 10. Severity Scores & Alarm Flags (K1)
  /\b(escores?\s+de\s+risco|critérios?\s+de\s+gravidade|sina(l|is)\s+de\s+alarme|red\s+flags?|estratificaçã[oo]\s+de\s+risco)\b/i,

  // 11. Invasive Procedures & Diagnostics (K1)
  /\b(punçã[oo]|cateterismo|intubaçã[oo]|sondagem|traqueostomia|toracocentese|paracentese|arteriografia)\b/i,
];

/**
 * Evaluates whether text contains any sensitive clinical risk keywords.
 */
export function containsClinicalRiskKeywords(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const normalized = text.toLowerCase().trim();
  return CLINICAL_RISK_PATTERNS.some((pattern) => pattern.test(normalized));
}
