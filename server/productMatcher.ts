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

const queryCache = new Map<
  string,
  { products: MakeupApiProduct[]; timestamp: number }
>();
const CACHE_DURATION_MS = 10 * 60 * 1000;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
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

  nameMatch = calculateNameSimilarity(normalized.nameTokens, apiProduct.name);

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
    const [brandTypeProducts, typeProducts] = await Promise.all([
      queryProducts({ brand: searchBrand, product_type: searchType }),
      queryProducts({ product_type: searchType }),
    ]);

    candidates =
      brandTypeProducts.length > 0 ? brandTypeProducts : typeProducts;
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
  }));

  scored.sort((a, b) => b.score.overall - a.score.overall);

  return scored
    .filter((result) => passesMatchThreshold(normalized, result.score))
    .slice(0, limit);
}

export async function matchProduct(
  normalized: NormalizedProduct,
): Promise<{
  match: MakeupApiProduct | null;
  score: MatchScore | null;
  alternatives: MakeupApiProduct[];
}> {
  const matches = await findBestMatches(normalized, 5);

  if (matches.length > 0) {
    return {
      match: matches[0].product,
      score: matches[0].score,
      alternatives: matches.slice(1, 4).map((m) => m.product),
    };
  }

  return { match: null, score: null, alternatives: [] };
}

export function formatCatalogProduct(apiProduct: MakeupApiProduct): {
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
  let price: number | null = null;
  if (apiProduct.price) {
    const parsed = parseFloat(apiProduct.price);
    if (!isNaN(parsed)) price = parsed;
  }

  let imageUrl = apiProduct.api_featured_image || apiProduct.image_link || null;
  if (imageUrl && imageUrl.startsWith("//")) {
    imageUrl = "https:" + imageUrl;
  }

  return {
    catalogId: String(apiProduct.id),
    catalogName: apiProduct.name,
    catalogBrand: apiProduct.brand,
    catalogPrice: price,
    catalogImageUrl: imageUrl,
    catalogProductUrl: apiProduct.product_link || null,
    catalogDescription: apiProduct.description || null,
    catalogColors: (apiProduct.product_colors || []).map((c) => ({
      hex: c.hex_value,
      name: c.colour_name,
    })),
    catalogRating: apiProduct.rating,
  };
}
