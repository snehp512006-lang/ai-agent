import { normalizeFieldName } from './inventoryRisksCalculations';
import { normalizeText } from './inventoryRisksUtils';

const CLASSIFIER_STOPWORDS = new Set([
  'TYPE', 'TYP', 'VARIANT', 'MODEL', 'SIZE', 'PACK', 'PACKET', 'PCS', 'PC', 'PIECE', 'PIECES',
  'ROLL', 'ROLLS', 'MTR', 'METER', 'METERS', 'MM', 'CM', 'INCH', 'INCHES', 'FT', 'FEET',
  'ML', 'LTR', 'L', 'KG', 'GM', 'G', 'SKU',
]);

const CLASSIFIER_COLOR_TOKENS = new Set([
  'WHITE', 'BLACK', 'BLUE', 'GREEN', 'RED', 'YELLOW', 'ORANGE', 'GREY', 'GRAY', 'SILVER', 'GOLD',
  'TRANSPARENT', 'CLEAR',
]);

const isSizeLikeToken = (token) => /^\d+(\.\d+)?(M|MM|CM|IN|FT|ML|L|KG|G|GM|MICRON)?$/i.test(token);

const tokenizeForClassification = (value) => {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
};

const toTitleCase = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
};

const buildVariantDescriptor = (prod) => {
  const rawName = normalizeText(prod?.name);
  const rawSku = normalizeText(prod?.sku).toUpperCase();
  const skuRoot = rawSku.replace(/[-_\s]*\d+$/g, '').replace(/[^A-Z0-9]/g, '');

  const tokens = tokenizeForClassification(rawName);
  const sizeTokens = [];
  const colorTokens = [];
  const baseTokens = [];
  const qualifierTokens = [];

  tokens.forEach((token) => {
    if (CLASSIFIER_STOPWORDS.has(token)) return;
    if (isSizeLikeToken(token)) {
      sizeTokens.push(token);
      return;
    }
    if (CLASSIFIER_COLOR_TOKENS.has(token)) {
      colorTokens.push(token);
      return;
    }
    if (token.length < 2) return;
    if (/\d/.test(token)) {
      qualifierTokens.push(token);
      return;
    }
    baseTokens.push(token);
  });

  const normalizedBaseTokens = baseTokens.length
    ? baseTokens
    : tokens.filter((token) => !CLASSIFIER_STOPWORDS.has(token) && !isSizeLikeToken(token));

  const familyTokens = normalizedBaseTokens.slice(0, 5);
  const stableFamilyTokens = [...familyTokens].sort();
  const familyLabel = toTitleCase(familyTokens.join(' ').trim() || rawName || 'Unclassified Products');
  const familyKey = normalizeFieldName(stableFamilyTokens.join('|') || skuRoot || rawName || String(prod?.id));

  const typeSignatureParts = [
    ...sizeTokens.slice(0, 2),
    ...colorTokens.slice(0, 2),
    ...qualifierTokens.slice(0, 2),
  ];

  return {
    familyKey,
    familyLabel,
    tokenSet: new Set(familyTokens),
    familyTokenCount: familyTokens.length,
    anchorToken: familyTokens[0] || '',
    skuRoot,
    typeSignature: typeSignatureParts.join(' ').trim(),
  };
};

const getVariantMatchScore = (descriptor, group) => {
  let score = 0;

  if (descriptor.familyKey && descriptor.familyKey === group.familyKey) {
    score += 6;
  }

  if (descriptor.skuRoot && group.skuRoots.has(descriptor.skuRoot) && descriptor.skuRoot.length >= 4) {
    score += 4;
  }

  if (descriptor.anchorToken && group.tokenSet.has(descriptor.anchorToken)) {
    score += 2;
  }

  let shared = 0;
  descriptor.tokenSet.forEach((token) => {
    if (group.tokenSet.has(token)) shared += 1;
  });

  score += shared * 1.5;

  const baseSize = Math.min(descriptor.familyTokenCount || 1, group.tokenSet.size || 1);
  const overlapRatio = shared / baseSize;
  if (overlapRatio >= 0.75) score += 3;
  else if (overlapRatio >= 0.5) score += 2;
  else if (overlapRatio >= 0.34) score += 1;

  return {
    score,
    shared,
    overlapRatio,
    skuMatch: Boolean(descriptor.skuRoot && group.skuRoots.has(descriptor.skuRoot)),
  };
};

export const getGroupedFilteredProducts = (filtered = []) => {
  const groups = [];

  filtered.forEach((prod) => {
    const descriptor = buildVariantDescriptor(prod);

    let bestGroup = null;
    let bestScore = -1;
    let bestScoreMeta = null;
    groups.forEach((group) => {
      const meta = getVariantMatchScore(descriptor, group);
      if (meta.score > bestScore) {
        bestScore = meta.score;
        bestScoreMeta = meta;
        bestGroup = group;
      }
    });

    const isReliableMatch = Boolean(
      bestGroup
      && bestScoreMeta
      && bestScoreMeta.score >= 4
      && (bestScoreMeta.shared >= 1 || bestScoreMeta.skuMatch)
    );

    if (!isReliableMatch) {
      groups.push({
        familyKey: descriptor.familyKey,
        familyLabel: descriptor.familyLabel,
        tokenSet: new Set(descriptor.tokenSet),
        skuRoots: new Set(descriptor.skuRoot ? [descriptor.skuRoot] : []),
        typeSignatures: new Set(descriptor.typeSignature ? [descriptor.typeSignature] : []),
        items: [prod],
      });
      return;
    }

    bestGroup.items.push(prod);
    descriptor.tokenSet.forEach((token) => bestGroup.tokenSet.add(token));
    if (descriptor.skuRoot) bestGroup.skuRoots.add(descriptor.skuRoot);
    if (descriptor.typeSignature) bestGroup.typeSignatures.add(descriptor.typeSignature);
  });

  return groups.map((group) => ({
    familyKey: group.familyKey,
    familyLabel: group.familyLabel,
    typeSignatures: Array.from(group.typeSignatures || []),
    items: group.items.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''))),
  }));
};
