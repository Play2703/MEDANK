/**
 * DeCS XML Parser (BIREME 2026 Format Tolerant)
 * Parses DeCS XML data into structured descriptor objects.
 */

import { resolveBestCategory, shouldSkipTerm } from './decsCategoryMap';

export interface DecsCode {
  system: 'DeCS' | 'MeSH';
  code: string;
}

export interface DecsDescriptor {
  ui: string;
  term: string;
  category: string;
  synonyms: string[];
  codes: DecsCode[];
  treeNumbers: string[];
}

function cleanString(rawStr: string): string {
  if (!rawStr) return '';

  let str = rawStr;
  // Unwrap CDATA if present: <![CDATA[...]]>
  const cdataMatch = str.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  if (cdataMatch) {
    str = cdataMatch[1];
  }

  return str
    .replace(/<[^>]+>/g, '') // Strip sub-tags if any
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses XML content and returns a list of valid, categorized DecsDescriptor objects.
 */
export function parseDecsXml(xmlContent: string): DecsDescriptor[] {
  if (!xmlContent || xmlContent.trim().length === 0) return [];

  // Split XML into record blocks (supporting MeSH/DeCS envelope tags)
  const recordRegex = /<(DescriptorRecordDescriptor|DescriptorRecord|record|DecsRecord|descriptor)[\s>][\s\S]*?<\/\1>/gi;
  const matches = xmlContent.match(recordRegex);

  const rawBlocks = matches || [];
  const descriptors: DecsDescriptor[] = [];

  for (const block of rawBlocks) {
    // 1. Extract UI / Code
    const uiMatch = block.match(/<(DescriptorUI|descriptor_id|decs_code|ui|UI)>([\s\S]*?)<\/\1>/i);
    const ui = uiMatch ? cleanString(uiMatch[2]) : '';
    if (!ui) continue;

    // 2. Extract Tree Numbers
    const treeNumbers: string[] = [];
    const treeRegex = /<(TreeNumber|tree_number|tree_id|treeNumber)>([\s\S]*?)<\/\1>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = treeRegex.exec(block)) !== null) {
      const val = cleanString(tm[2]);
      if (val) treeNumbers.push(val);
    }

    // Determine category from tree numbers
    const category = resolveBestCategory(treeNumbers);
    if (!category) continue; // Skip non-clinical categories

    // 3. Extract Preferred Descriptor Name
    let rawTermStr = '';
    const descNameMatch = block.match(/<DescriptorName[\s\S]*?<String>([\s\S]*?)<\/String>/i);
    if (descNameMatch) {
      rawTermStr = cleanString(descNameMatch[1]);
    } else {
      const ptMatch = block.match(/<(descriptor_name_pt|nome_pt|term_pt|name_pt)>([\s\S]*?)<\/\1>/i);
      if (ptMatch) {
        rawTermStr = cleanString(ptMatch[2]);
      }
    }

    if (!rawTermStr) continue;

    // BIREME format often combines PT and EN as "NomePT[NomeEN]"
    let termPt = rawTermStr;
    const synonymsSet = new Set<string>();

    const bracketMatch = rawTermStr.match(/^([^\[]+)\[([^\]]+)\]$/);
    if (bracketMatch) {
      termPt = bracketMatch[1].trim();
      const termEn = bracketMatch[2].trim();
      if (termEn && !shouldSkipTerm(termEn)) {
        synonymsSet.add(termEn.toLowerCase());
      }
    }

    if (!termPt || shouldSkipTerm(termPt)) continue;

    // 4. Extract Synonyms / Entry terms (Restricted to preferred concept terms for optimal dictionary size)
    const termRegex = /<Term[\s\S]*?<String>([\s\S]*?)<\/String>/gi;
    let stm: RegExpExecArray | null;
    while ((stm = termRegex.exec(block)) !== null) {
      const termTag = stm[0];
      const rawVal = cleanString(stm[1]);
      if (!rawVal || rawVal.includes(',')) continue; // Skip inverted permuted terms like "Hypertension, Renal"

      // Exclude permuted terms like "Hypertension, Renal"
      const isPermuted = termTag.includes('IsPermutedTermYN="Y"') || rawVal.includes(',');
      if (isPermuted) continue;

      let val = rawVal;
      const bMatch = rawVal.match(/^([^\[]+)\[([^\]]+)\]$/);
      if (bMatch) {
        val = bMatch[1].trim();
        const enVal = bMatch[2].trim();
        if (enVal && enVal.toLowerCase() !== termPt.toLowerCase() && !enVal.includes(',') && !shouldSkipTerm(enVal)) {
          synonymsSet.add(enVal.toLowerCase());
        }
      }

      if (val && val.toLowerCase() !== termPt.toLowerCase() && !shouldSkipTerm(val)) {
        synonymsSet.add(val.toLowerCase());
      }
    }

    // Add UI code to synonyms so NER can recognize D-number codes if present in text
    if (ui && ui.length >= 3) {
      synonymsSet.add(ui);
    }

    const normTerm = normalizeText(termPt);
    const synonyms = Array.from(synonymsSet).filter(
      (s) => normalizeText(s) !== normTerm
    );

    const codes: DecsCode[] = [
      { system: 'DeCS', code: ui },
    ];
    if (ui.startsWith('D') || ui.startsWith('C')) {
      codes.push({ system: 'MeSH', code: ui });
    }

    descriptors.push({
      ui,
      term: termPt.toLowerCase(),
      category,
      synonyms,
      codes,
      treeNumbers,
    });
  }

  return descriptors;
}
