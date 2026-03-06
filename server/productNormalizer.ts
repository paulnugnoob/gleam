import type { NormalizedProduct } from "../shared/schema";

const BRAND_ALIASES: Record<string, string> = {
  "charlotte tilbury": "charlotte_tilbury",
  "ct": "charlotte_tilbury",
  "mac": "mac",
  "m.a.c": "mac",
  "m.a.c.": "mac",
  "mac cosmetics": "mac",
  "nars": "nars",
  "nars cosmetics": "nars",
  "fenty": "fenty",
  "fenty beauty": "fenty",
  "rare beauty": "rare_beauty",
  "rare": "rare_beauty",
  "maybelline": "maybelline",
  "maybelline new york": "maybelline",
  "loreal": "l'oreal",
  "l'oreal": "l'oreal",
  "l'oreal paris": "l'oreal",
  "revlon": "revlon",
  "covergirl": "covergirl",
  "nyx": "nyx",
  "nyx professional makeup": "nyx",
  "nyx cosmetics": "nyx",
  "too faced": "too_faced",
  "toofaced": "too_faced",
  "urban decay": "urban_decay",
  "benefit": "benefit",
  "benefit cosmetics": "benefit",
  "elf": "e.l.f.",
  "e.l.f.": "e.l.f.",
  "e.l.f": "e.l.f.",
  "clinique": "clinique",
  "estee lauder": "estee_lauder",
  "estée lauder": "estee_lauder",
  "bobbi brown": "bobbi_brown",
  "tarte": "tarte",
  "tarte cosmetics": "tarte",
  "hourglass": "hourglass",
  "laura mercier": "laura_mercier",
  "morphe": "morphe",
  "makeup forever": "makeup_forever",
  "make up for ever": "makeup_forever",
  "mufe": "makeup_forever",
  "anastasia beverly hills": "anastasia",
  "anastasia": "anastasia",
  "abh": "anastasia",
  "milani": "milani",
  "wet n wild": "wet_n_wild",
  "wetnwild": "wet_n_wild",
  "colourpop": "colourpop",
  "colour pop": "colourpop",
  "physicians formula": "physicians_formula",
  "pat mcgrath": "pat_mcgrath",
  "pat mcgrath labs": "pat_mcgrath",
  "dior": "dior",
  "christian dior": "dior",
  "chanel": "chanel",
  "ysl": "ysl",
  "yves saint laurent": "ysl",
  "armani": "giorgio_armani",
  "giorgio armani": "giorgio_armani",
  "lancome": "lancome",
  "lancôme": "lancome",
  "glossier": "glossier",
  "kosas": "kosas",
  "tower 28": "tower_28",
  "merit": "merit",
  "ilia": "ilia",
  "saie": "saie",
};

const CATEGORY_MAPPING: Record<string, string> = {
  "foundation": "foundation",
  "concealer": "concealer",
  "lipstick": "lipstick",
  "lip_gloss": "lip_gloss",
  "lipgloss": "lip_gloss",
  "lip gloss": "lip_gloss",
  "gloss": "lip_gloss",
  "mascara": "mascara",
  "blush": "blush",
  "eyeshadow": "eyeshadow",
  "eye shadow": "eyeshadow",
  "primer": "primer",
  "face primer": "primer",
  "eye primer": "primer",
  "setting_spray": "setting_spray",
  "setting spray": "setting_spray",
  "bronzer": "bronzer",
  "highlighter": "highlighter",
  "highlight": "highlighter",
  "powder": "powder",
  "setting powder": "powder",
  "face powder": "powder",
  "eyeliner": "eyeliner",
  "eye liner": "eyeliner",
  "liner": "eyeliner",
  "brow": "brow",
  "eyebrow": "brow",
  "brow pencil": "brow",
  "brow gel": "brow",
  "contour": "contour",
  "lip_liner": "lip_liner",
  "lip liner": "lip_liner",
  "lipliner": "lip_liner",
  "nail_polish": "nail_polish",
  "nail polish": "nail_polish",
  "nail lacquer": "nail_polish",
  "nail": "nail_polish",
  "complexion": "foundation",
  "base": "foundation",
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "shall", "can", "need",
  "my", "your", "his", "her", "its", "our", "their", "this", "that",
  "these", "those", "i", "you", "he", "she", "it", "we", "they",
  "new", "best", "favorite", "fav", "holy", "grail", "amazing", "love",
  "beautiful", "perfect", "gorgeous", "stunning", "beauty", "makeup",
  "product", "products", "cosmetics", "collection", "shade", "color",
  "colour", "mini", "full", "size", "limited", "edition",
]);

export function normalizeBrand(brand: string | null): string | null {
  if (!brand) return null;
  
  const normalized = brand.toLowerCase().trim();
  return BRAND_ALIASES[normalized] || normalized.replace(/\s+/g, "_");
}

export function normalizeCategory(type: string | null): string {
  if (!type) return "unknown";
  
  const normalized = type.toLowerCase().trim();
  return CATEGORY_MAPPING[normalized] || normalized.replace(/\s+/g, "_");
}

export function tokenizeName(name: string): string[] {
  if (!name) return [];
  
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

export function normalizeProduct(
  name: string,
  brand: string | null,
  type: string | null
): NormalizedProduct {
  return {
    brandSlug: normalizeBrand(brand),
    nameTokens: tokenizeName(name),
    categoryKey: normalizeCategory(type),
  };
}

export function getMakeupApiBrandSlug(normalizedBrand: string | null): string | null {
  if (!normalizedBrand) return null;
  
  const MAKEUP_API_BRANDS: Record<string, string> = {
    "charlotte_tilbury": "charlotte tilbury",
    "mac": "mac",
    "nars": "nars",
    "fenty": "fenty",
    "rare_beauty": "rare beauty",
    "maybelline": "maybelline",
    "l'oreal": "l'oreal",
    "revlon": "revlon",
    "covergirl": "covergirl",
    "nyx": "nyx",
    "too_faced": "too faced",
    "urban_decay": "urban decay",
    "benefit": "benefit",
    "e.l.f.": "e.l.f.",
    "clinique": "clinique",
    "estee_lauder": "estee lauder",
    "bobbi_brown": "bobbi brown",
    "tarte": "tarte",
    "hourglass": "hourglass",
    "laura_mercier": "laura mercier",
    "morphe": "morphe",
    "makeup_forever": "makeup forever",
    "anastasia": "anastasia beverly hills",
    "milani": "milani",
    "wet_n_wild": "wet n wild",
    "colourpop": "colourpop",
    "physicians_formula": "physicians formula",
    "pat_mcgrath": "pat mcgrath",
    "dior": "dior",
    "chanel": "chanel",
    "ysl": "ysl",
    "giorgio_armani": "giorgio armani",
    "lancome": "lancome",
    "glossier": "glossier",
    "kosas": "kosas",
    "tower_28": "tower 28",
    "merit": "merit",
    "ilia": "ilia",
    "saie": "saie",
  };
  
  return MAKEUP_API_BRANDS[normalizedBrand] || normalizedBrand.replace(/_/g, " ");
}

export function getMakeupApiProductType(normalizedCategory: string): string {
  const MAKEUP_API_TYPES: Record<string, string> = {
    "foundation": "foundation",
    "concealer": "foundation",
    "lipstick": "lipstick",
    "lip_gloss": "lipstick",
    "mascara": "mascara",
    "blush": "blush",
    "eyeshadow": "eyeshadow",
    "primer": "foundation",
    "setting_spray": "foundation",
    "bronzer": "bronzer",
    "highlighter": "blush",
    "powder": "foundation",
    "eyeliner": "eyeliner",
    "brow": "eyebrow",
    "contour": "bronzer",
    "lip_liner": "lipstick",
    "nail_polish": "nail_polish",
    "moisturizer": "foundation",
    "applicator": "unsupported",
    "unknown": "unsupported",
  };
  
  return MAKEUP_API_TYPES[normalizedCategory] || "unsupported";
}

export function calculateNameSimilarity(tokens: string[], productName: string): number {
  if (!tokens.length || !productName) return 0;
  
  const nameTokens = tokenizeName(productName);
  if (!nameTokens.length) return 0;
  
  let matches = 0;
  for (const token of tokens) {
    if (nameTokens.some(nt => nt.includes(token) || token.includes(nt))) {
      matches++;
    }
  }
  
  return matches / Math.max(tokens.length, nameTokens.length);
}
