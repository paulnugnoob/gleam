import type { MatchScore, NormalizedProduct } from "../shared/schema";
import {
  getMakeupApiBrandSlug,
  getMakeupApiProductType,
  calculateNameSimilarity,
} from "./productNormalizer";

const MAKEUP_API_BASE = "http://makeup-api.herokuapp.com/api/v1";
const API_TIMEOUT_MS = 15000;

const AVAILABLE_BRANDS = new Set([
  "almay",
  "alva",
  "anna sui",
  "annabelle",
  "benefit",
  "boosh",
  "burt's bees",
  "butter london",
  "c'est moi",
  "cargo cosmetics",
  "china glaze",
  "clinique",
  "coastal classic creation",
  "colourpop",
  "covergirl",
  "dalish",
  "deciem",
  "dior",
  "dr. hauschka",
  "e.l.f.",
  "essie",
  "fenty",
  "glossier",
  "green people",
  "iman",
  "l'oreal",
  "lotus cosmetics usa",
  "maia's mineral galaxy",
  "marcelle",
  "marienatie",
  "maybelline",
  "milani",
  "mineral fusion",
  "misa",
  "mistura",
  "moov",
  "nudus",
  "nyx",
  "orly",
  "pacifica",
  "penny lane organics",
  "physicians formula",
  "piggy paint",
  "pure anada",
  "rejuva minerals",
  "revlon",
  "sally b's skin yummies",
  "salon perfect",
  "sante",
  "sinful colours",
  "smashbox",
  "stila",
  "suncoat",
  "w3llpeople",
  "wet n wild",
  "zorah",
  "zorah biocosmetiques",
]);

export interface MakeupApiProduct {
  id: number;
  brand: string;
  name: string;
  price: string;
  price_sign: string | null;
  currency: string | null;
  image_link: string;
  api_featured_image: string;
  product_link: string;
  website_link: string;
  product_type: string;
  category: string | null;
  description: string;
  rating: number | null;
  product_colors: Array<{ hex_value: string; colour_name: string }>;
  tag_list: string[];
}

interface MatchResult {
  product: MakeupApiProduct;
  score: MatchScore;
}

export interface CatalogProduct {
  source: "ebay" | "makeup_api";
  sourceId: string;
  name: string;
  brand: string | null;
  price: number | null;
  imageUrl: string | null;
  productUrl: string | null;
  description: string | null;
  colors: Array<{ hex: string; name: string }>;
  rating: number | null;
  productType: string | null;
}

interface CatalogMatchResult {
  product: CatalogProduct;
  score: MatchScore;
}

const queryCache = new Map<
  string,
  { products: MakeupApiProduct[]; timestamp: number }
>();
const CACHE_DURATION_MS = 10 * 60 * 1000;
const LOSSY_MATCHED_TYPES = new Set(["foundation", "lipstick", "blush", "bronzer"]);
const LOSSY_CATEGORY_KEYS = new Set([
  "primer",
  "setting_spray",
  "powder",
  "concealer",
  "highlighter",
  "contour",
  "lip_liner",
  "lip_gloss",
]);
const EBAY_BROWSE_BASE = "https://api.ebay.com/buy/browse/v1";
const EBAY_IDENTITY_BASE = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_PROVIDER_ORDER = ["ebay", "makeup_api"] as const;
const ebayTokenCache: {
  accessToken: string | null;
  expiresAt: number;
} = {
  accessToken: null,
  expiresAt: 0,
};
const CATEGORY_HARD_RULES: Partial<
  Record<
    string,
    {
      requiredKeywords?: string[];
      bannedKeywords?: string[];
    }
  >
> = {
  primer: {
    bannedKeywords: ["lip", "lash", "mascara", "brow", "eyebrow", "liner"],
  },
  setting_spray: {
    requiredKeywords: ["spray", "mist", "fix"],
    bannedKeywords: ["powder", "primer", "foundation", "lip"],
  },
  powder: {
    requiredKeywords: ["powder"],
    bannedKeywords: ["liquid", "drop", "serum", "spray", "lip"],
  },
  concealer: {
    requiredKeywords: ["concealer", "correct"],
    bannedKeywords: ["powder", "primer", "spray", "lip"],
  },
  contour: {
    requiredKeywords: ["contour", "sculpt", "bronze", "palette"],
    bannedKeywords: ["lip", "primer", "mascara"],
  },
  highlighter: {
    requiredKeywords: ["highlight", "glow", "illumin", "lumi"],
    bannedKeywords: ["lip", "primer", "mascara"],
  },
  lip_liner: {
    requiredKeywords: ["lip", "liner", "pencil"],
    bannedKeywords: ["eye", "brow", "mascara"],
  },
  lip_gloss: {
    requiredKeywords: ["gloss", "lip"],
    bannedKeywords: ["liner", "eye", "brow", "primer"],
  },
};

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function queryProducts(params: {
  brand?: string;
  product_type?: string;
}): Promise<MakeupApiProduct[]> {
  const queryParts: string[] = [];
  if (params.brand)
    queryParts.push(`brand=${encodeURIComponent(params.brand)}`);
  if (params.product_type)
    queryParts.push(`product_type=${encodeURIComponent(params.product_type)}`);

  const cacheKey = queryParts.join("&") || "all";
  const cached = queryCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
    return cached.products;
  }

  const url =
    queryParts.length > 0
      ? `${MAKEUP_API_BASE}/products.json?${queryParts.join("&")}`
      : `${MAKEUP_API_BASE}/products.json`;

  try {
    const response = await fetchWithTimeout(url, API_TIMEOUT_MS);
    if (!response.ok) {
      console.error(`Makeup API error: ${response.status} for ${cacheKey}`);
      return cached?.products || [];
    }

    const products: MakeupApiProduct[] = await response.json();
    queryCache.set(cacheKey, { products, timestamp: Date.now() });

    console.log(
      `[MakeupAPI] Fetched ${products.length} products for: ${cacheKey || "all"}`,
    );
    return products;
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.error(`[MakeupAPI] Timeout for: ${cacheKey}`);
    } else {
      console.error(`[MakeupAPI] Error for ${cacheKey}:`, error.message);
    }
    return cached?.products || [];
  }
}

function getCatalogProviderOrder(): Array<"ebay" | "makeup_api"> {
  const raw = process.env.CATALOG_PROVIDER_ORDER?.trim();
  if (!raw) {
    return [...DEFAULT_PROVIDER_ORDER];
  }

  const parsed = raw
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(
      (provider): provider is "ebay" | "makeup_api" =>
        provider === "ebay" || provider === "makeup_api",
    );

  return parsed.length > 0 ? parsed : [...DEFAULT_PROVIDER_ORDER];
}

function formatPrice(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSearchQuery(normalized: NormalizedProduct): string {
  const parts = [
    normalized.brandSlug ? getMakeupApiBrandSlug(normalized.brandSlug) : null,
    normalized.nameTokens.join(" "),
  ].filter(Boolean);

  return parts.join(" ").trim();
}

function getTypeKeywords(normalized: NormalizedProduct): string[] {
  const fallbackType = normalized.categoryKey.replace(/_/g, " ");
  switch (normalized.categoryKey) {
    case "primer":
      return ["primer"];
    case "setting_spray":
      return ["setting", "spray", "mist", "fix"];
    case "powder":
      return ["powder"];
    case "concealer":
      return ["concealer", "corrector"];
    case "brow":
      return ["brow", "eyebrow"];
    case "lip_gloss":
      return ["lip", "gloss"];
    case "lip_liner":
      return ["lip", "liner", "pencil"];
    case "eyeshadow":
      return ["eyeshadow", "shadow", "palette"];
    default:
      return fallbackType ? fallbackType.split(/\s+/) : [];
  }
}

function scoreCatalogCandidate(
  normalized: NormalizedProduct,
  candidate: CatalogProduct,
): MatchScore {
  let brandMatch = 0;
  let typeMatch = 0;

  if (normalized.brandSlug && candidate.brand) {
    const expectedBrand = getMakeupApiBrandSlug(normalized.brandSlug) || "";
    const actualBrand = candidate.brand.toLowerCase();
    if (actualBrand === expectedBrand.toLowerCase()) {
      brandMatch = 1;
    } else if (
      actualBrand.includes(expectedBrand.toLowerCase()) ||
      expectedBrand.toLowerCase().includes(actualBrand)
    ) {
      brandMatch = 0.7;
    }
  }

  const titleTokens = tokenizeCandidateText(candidate.name);
  const typeKeywords = getTypeKeywords(normalized);
  if (typeKeywords.length === 0) {
    typeMatch = 0.3;
  } else if (
    typeKeywords.every((keyword) =>
      titleTokens.some((token) => token.includes(keyword) || keyword.includes(token)),
    )
  ) {
    typeMatch = 1;
  } else if (
    typeKeywords.some((keyword) =>
      titleTokens.some((token) => token.includes(keyword) || keyword.includes(token)),
    )
  ) {
    typeMatch = 0.5;
  }

  const nameMatch = Math.round(
    calculateNameSimilarity(normalized.nameTokens, candidate.name) * 100,
  ) / 100;

  const brandWeight = normalized.brandSlug ? 0.35 : 0;
  const typeWeight = 0.2;
  const nameWeight = 0.45;
  const totalWeight = brandWeight + typeWeight + nameWeight;
  const overall =
    totalWeight > 0
      ? (brandMatch * brandWeight +
          typeMatch * typeWeight +
          nameMatch * nameWeight) /
        totalWeight
      : 0;

  return {
    overall: Math.round(overall * 100) / 100,
    brandMatch: Math.round(brandMatch * 100) / 100,
    typeMatch: Math.round(typeMatch * 100) / 100,
    nameMatch,
  };
}

function tokenizeCandidateText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function passesCatalogThreshold(
  normalized: NormalizedProduct,
  score: MatchScore,
): boolean {
  if (score.overall < 0.4) {
    return false;
  }

  if (normalized.brandSlug && score.brandMatch < 0.6 && score.nameMatch < 0.5) {
    return false;
  }

  if (normalized.nameTokens.length >= 3 && score.nameMatch < 0.35) {
    return false;
  }

  if (isLossyMappedCategory(normalized) && score.nameMatch < 0.45) {
    return false;
  }

  return true;
}

async function getEbayAccessToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  if (ebayTokenCache.accessToken && ebayTokenCache.expiresAt > Date.now() + 60_000) {
    return ebayTokenCache.accessToken;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: EBAY_SCOPE,
  });

  const tokenResponse = await fetchWithTimeout(EBAY_IDENTITY_BASE, API_TIMEOUT_MS, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    console.error(`[eBay] OAuth failed: ${tokenResponse.status}`);
    return null;
  }

  const json = (await tokenResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    return null;
  }

  ebayTokenCache.accessToken = json.access_token;
  ebayTokenCache.expiresAt = Date.now() + (json.expires_in || 7200) * 1000;
  return json.access_token;
}

async function findEbayMatches(
  normalized: NormalizedProduct,
  limit: number = 3,
): Promise<CatalogMatchResult[]> {
  const accessToken = await getEbayAccessToken();
  if (!accessToken) {
    return [];
  }

  const query = getSearchQuery(normalized);
  if (!query) {
    return [];
  }

  const url = new URL(`${EBAY_BROWSE_BASE}/item_summary/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");

  const response = await fetchWithTimeout(url.toString(), API_TIMEOUT_MS, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`[eBay] Browse search failed: ${response.status}`);
    return [];
  }

  const json = (await response.json()) as {
    itemSummaries?: Array<{
      itemId: string;
      title: string;
      price?: { value?: string };
      image?: { imageUrl?: string };
      itemWebUrl?: string;
      seller?: { username?: string };
      categories?: Array<{ categoryName?: string }>;
      shortDescription?: string;
      condition?: string;
    }>;
  };

  const candidates = (json.itemSummaries || []).map((item): CatalogProduct => ({
    source: "ebay",
    sourceId: item.itemId,
    name: item.title,
    brand: normalized.brandSlug
      ? getMakeupApiBrandSlug(normalized.brandSlug)
      : null,
    price: formatPrice(item.price?.value),
    imageUrl: item.image?.imageUrl || null,
    productUrl: item.itemWebUrl || null,
    description: item.shortDescription || item.condition || null,
    colors: [],
    rating: null,
    productType: normalized.categoryKey,
  }));

  return candidates
    .filter((candidate) => passesCategoryHardRules(normalized, {
      id: 0,
      brand: candidate.brand || "",
      name: candidate.name,
      price: candidate.price?.toString() || "",
      price_sign: null,
      currency: null,
      image_link: candidate.imageUrl || "",
      api_featured_image: candidate.imageUrl || "",
      product_link: candidate.productUrl || "",
      website_link: candidate.productUrl || "",
      product_type: candidate.productType || "",
      category: null,
      description: candidate.description || "",
      rating: null,
      product_colors: [],
      tag_list: [],
    }))
    .map((candidate) => ({
      product: candidate,
      score: scoreCatalogCandidate(normalized, candidate),
    }))
    .filter((result) => passesCatalogThreshold(normalized, result.score))
    .sort((a, b) => {
      if (b.score.overall !== a.score.overall) {
        return b.score.overall - a.score.overall;
      }
      return b.score.nameMatch - a.score.nameMatch;
    })
    .slice(0, limit);
}

function toCatalogProduct(apiProduct: MakeupApiProduct): CatalogProduct {
  let imageUrl = apiProduct.api_featured_image || apiProduct.image_link || null;
  if (imageUrl && imageUrl.startsWith("//")) {
    imageUrl = `https:${imageUrl}`;
  }

  return {
    source: "makeup_api",
    sourceId: String(apiProduct.id),
    name: apiProduct.name,
    brand: apiProduct.brand || null,
    price: formatPrice(apiProduct.price),
    imageUrl,
    productUrl: apiProduct.product_link || null,
    description: apiProduct.description || null,
    colors: (apiProduct.product_colors || []).map((color) => ({
      hex: color.hex_value,
      name: color.colour_name,
    })),
    rating: apiProduct.rating,
    productType: apiProduct.product_type || null,
  };
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^\w]/g, "");
}

function getNameTokenStats(
  normalized: NormalizedProduct,
  apiProduct: MakeupApiProduct,
): {
  matchedTokens: number;
  expectedTokenCount: number;
  productTokenCount: number;
  hasOrderedPhraseMatch: boolean;
} {
  const nameTokens = apiProduct.name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const normalizedExpectedTokens = normalized.nameTokens.map(normalizeToken);
  const normalizedProductTokens = nameTokens.map(normalizeToken);

  let matchedTokens = 0;
  for (const token of normalizedExpectedTokens) {
    if (
      normalizedProductTokens.some(
        (productToken) =>
          productToken.includes(token) || token.includes(productToken),
      )
    ) {
      matchedTokens += 1;
    }
  }

  const expectedPhrase = normalizedExpectedTokens.join(" ").trim();
  const productPhrase = normalizedProductTokens.join(" ").trim();
  const hasOrderedPhraseMatch =
    Boolean(expectedPhrase) &&
    Boolean(productPhrase) &&
    (productPhrase.includes(expectedPhrase) || expectedPhrase.includes(productPhrase));

  return {
    matchedTokens,
    expectedTokenCount: normalizedExpectedTokens.length,
    productTokenCount: normalizedProductTokens.length,
    hasOrderedPhraseMatch,
  };
}

function isLossyMappedCategory(normalized: NormalizedProduct): boolean {
  const searchType = getMakeupApiProductType(normalized.categoryKey);
  return (
    LOSSY_CATEGORY_KEYS.has(normalized.categoryKey) ||
    LOSSY_MATCHED_TYPES.has(searchType)
  );
}

function uniqueProducts(products: MakeupApiProduct[]): MakeupApiProduct[] {
  const seen = new Set<number>();
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }
    seen.add(product.id);
    return true;
  });
}

function getCandidateKeywords(apiProduct: MakeupApiProduct): string[] {
  return [
    apiProduct.name,
    apiProduct.product_type,
    apiProduct.category,
    ...(apiProduct.tag_list || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function intersectsKeywords(
  haystack: string[],
  needles: string[] | undefined,
): boolean {
  if (!needles || needles.length === 0) {
    return false;
  }

  return needles.some((needle) =>
    haystack.some(
      (token) => token.includes(needle) || needle.includes(token),
    ),
  );
}

function passesCategoryHardRules(
  normalized: NormalizedProduct,
  apiProduct: MakeupApiProduct,
): boolean {
  const rule = CATEGORY_HARD_RULES[normalized.categoryKey];
  if (!rule) {
    return true;
  }

  const candidateKeywords = getCandidateKeywords(apiProduct);
  const expectedKeywords = normalized.nameTokens.map(normalizeToken);

  if (
    rule.bannedKeywords &&
    intersectsKeywords(candidateKeywords, rule.bannedKeywords) &&
    !intersectsKeywords(expectedKeywords, rule.bannedKeywords)
  ) {
    return false;
  }

  if (
    rule.requiredKeywords &&
    !intersectsKeywords(candidateKeywords, rule.requiredKeywords) &&
    !intersectsKeywords(expectedKeywords, rule.requiredKeywords)
  ) {
    return false;
  }

  return true;
}

function scoreMatch(
  normalized: NormalizedProduct,
  apiProduct: MakeupApiProduct,
): MatchScore {
  let brandMatch = 0;
  let typeMatch = 0;
  let nameMatch = 0;

  if (normalized.brandSlug) {
    const apiBrand = (apiProduct.brand || "").toLowerCase();
    const searchBrand = getMakeupApiBrandSlug(normalized.brandSlug) || "";

    if (apiBrand === searchBrand.toLowerCase()) {
      brandMatch = 1.0;
    } else if (
      apiBrand.includes(searchBrand.toLowerCase()) ||
      searchBrand.toLowerCase().includes(apiBrand)
    ) {
      brandMatch = 0.7;
    }
  }

  const apiType = (apiProduct.product_type || "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const searchType = getMakeupApiProductType(normalized.categoryKey);

  if (apiType === searchType) {
    typeMatch = 1.0;
  } else if (apiType.includes(searchType) || searchType.includes(apiType)) {
    typeMatch = 0.5;
  }

  const baselineNameSimilarity = calculateNameSimilarity(
    normalized.nameTokens,
    apiProduct.name,
  );
  const tokenStats = getNameTokenStats(normalized, apiProduct);
  const expectedCoverage =
    tokenStats.expectedTokenCount > 0
      ? tokenStats.matchedTokens / tokenStats.expectedTokenCount
      : 0;
  const productCoverage =
    tokenStats.productTokenCount > 0
      ? tokenStats.matchedTokens / tokenStats.productTokenCount
      : 0;

  nameMatch = Math.max(
    baselineNameSimilarity,
    expectedCoverage * 0.7 + productCoverage * 0.3,
  );

  if (tokenStats.hasOrderedPhraseMatch) {
    nameMatch = Math.min(1, nameMatch + 0.15);
  }

  const brandWeight = normalized.brandSlug ? 0.4 : 0;
  const typeWeight = 0.3;
  const nameWeight = 0.3;

  const totalWeight = brandWeight + typeWeight + nameWeight;
  const overall =
    totalWeight > 0
      ? (brandMatch * brandWeight +
          typeMatch * typeWeight +
          nameMatch * nameWeight) /
        totalWeight
      : 0;

  return {
    overall: Math.round(overall * 100) / 100,
    brandMatch: Math.round(brandMatch * 100) / 100,
    typeMatch: Math.round(typeMatch * 100) / 100,
    nameMatch: Math.round(nameMatch * 100) / 100,
  };
}

function isBrandAvailable(brand: string | undefined): boolean {
  if (!brand) return false;
  const normalized = brand.toLowerCase().trim();
  return AVAILABLE_BRANDS.has(normalized);
}

function passesMatchThreshold(
  normalized: NormalizedProduct,
  score: MatchScore,
): boolean {
  if (score.overall < 0.35) {
    return false;
  }

  if (normalized.brandSlug) {
    // If we think we know the brand, reject weak type-only matches.
    if (score.brandMatch < 0.6 && score.nameMatch < 0.55) {
      return false;
    }

    if (normalized.nameTokens.length >= 3 && score.nameMatch < 0.3) {
      return false;
    }

    if (isLossyMappedCategory(normalized) && score.nameMatch < 0.4) {
      return false;
    }

    return score.overall >= 0.45;
  }

  // Without a brand, force stronger name alignment before surfacing a match.
  if (score.nameMatch < 0.45) {
    return false;
  }

  return score.overall >= 0.4;
}

export async function findBestMatches(
  normalized: NormalizedProduct,
  limit: number = 3,
): Promise<MatchResult[]> {
  const searchBrand = normalized.brandSlug
    ? getMakeupApiBrandSlug(normalized.brandSlug) || undefined
    : undefined;
  const searchType = getMakeupApiProductType(normalized.categoryKey);

  let candidates: MakeupApiProduct[] = [];

  const brandAvailable = isBrandAvailable(searchBrand);

  if (searchType === "unsupported") {
    console.log(
      `[MakeupAPI] Skipping unsupported category: ${normalized.categoryKey}`,
    );
    return [];
  }

  if (brandAvailable && searchBrand && searchType) {
    const shouldQueryBrandOnly = isLossyMappedCategory(normalized);
    const [brandTypeProducts, typeProducts, brandOnlyProducts] = await Promise.all([
      queryProducts({ brand: searchBrand, product_type: searchType }),
      queryProducts({ product_type: searchType }),
      shouldQueryBrandOnly ? queryProducts({ brand: searchBrand }) : Promise.resolve([]),
    ]);

    candidates = uniqueProducts([
      ...brandTypeProducts,
      ...brandOnlyProducts,
      ...(brandTypeProducts.length > 0 ? [] : typeProducts),
    ]);
  } else if (searchType) {
    candidates = await queryProducts({ product_type: searchType });
  } else if (brandAvailable && searchBrand) {
    candidates = await queryProducts({ brand: searchBrand });
  }

  if (candidates.length === 0) {
    const brandNote =
      searchBrand && !brandAvailable
        ? ` (brand '${searchBrand}' not in catalog)`
        : "";
    console.log(`[MakeupAPI] No matches for type=${searchType}${brandNote}`);
    return [];
  }

  const scored: MatchResult[] = candidates.map((product) => ({
    product,
    score: scoreMatch(normalized, product),
  }))
    .filter((result) => passesCategoryHardRules(normalized, result.product));

  scored.sort((a, b) => {
    if (b.score.overall !== a.score.overall) {
      return b.score.overall - a.score.overall;
    }
    if (b.score.nameMatch !== a.score.nameMatch) {
      return b.score.nameMatch - a.score.nameMatch;
    }
    return b.score.brandMatch - a.score.brandMatch;
  });

  return scored
    .filter((result) => passesMatchThreshold(normalized, result.score))
    .slice(0, limit);
}

export async function matchProduct(
  normalized: NormalizedProduct,
): Promise<{
  match: CatalogProduct | null;
  score: MatchScore | null;
  alternatives: CatalogProduct[];
}> {
  const providerOrder = getCatalogProviderOrder();

  for (const provider of providerOrder) {
    if (provider === "ebay") {
      const ebayMatches = await findEbayMatches(normalized, 5);
      if (ebayMatches.length > 0) {
        return {
          match: ebayMatches[0].product,
          score: ebayMatches[0].score,
          alternatives: ebayMatches.slice(1, 4).map((match) => match.product),
        };
      }
      continue;
    }

    const matches = await findBestMatches(normalized, 5);

    if (matches.length > 0) {
      return {
        match: toCatalogProduct(matches[0].product),
        score: matches[0].score,
        alternatives: matches.slice(1, 4).map((match) => toCatalogProduct(match.product)),
      };
    }
  }

  return { match: null, score: null, alternatives: [] };
}

export function formatCatalogProduct(apiProduct: CatalogProduct): {
  catalogId: string;
  catalogName: string;
  catalogBrand: string;
  catalogPrice: number | null;
  catalogImageUrl: string | null;
  catalogProductUrl: string | null;
  catalogDescription: string | null;
  catalogColors: Array<{ hex: string; name: string }>;
  catalogRating: number | null;
} {
  return {
    catalogId: apiProduct.sourceId,
    catalogName: apiProduct.name,
    catalogBrand: apiProduct.brand || "",
    catalogPrice: apiProduct.price,
    catalogImageUrl: apiProduct.imageUrl,
    catalogProductUrl: apiProduct.productUrl,
    catalogDescription: apiProduct.description,
    catalogColors: apiProduct.colors,
    catalogRating: apiProduct.rating,
  };
}
