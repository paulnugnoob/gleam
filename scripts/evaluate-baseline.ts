import * as fs from "node:fs";
import * as path from "node:path";
import "../server/loadEnv";
import { checkAnalysisProviderHealth } from "../server/aiProvider";
import { analyzeVideo } from "../server/analysis/videoAnalysisService";
import { storage } from "../server/storage";
import type { DetectedProduct, PresentedProduct } from "@shared/schema";

interface ExpectedProduct {
  name: string;
  brand?: string;
  type?: string;
  required?: boolean;
  mustMatchCatalog?: boolean;
}

interface EvaluationCase {
  id: string;
  url: string;
  platform?: string;
  notes?: string;
  expectedProducts: ExpectedProduct[];
}

interface EvaluationDataset {
  name: string;
  description?: string;
  cases: EvaluationCase[];
}

interface ProductEvaluation {
  expected: ExpectedProduct;
  detectedMatch: DetectedProduct | null;
  detectedScore: number;
  catalogMatch: DetectedProduct | null;
  catalogScore: number;
}

interface CaseResult {
  id: string;
  url: string;
  status: "completed" | "failed";
  analysisId?: number;
  error?: string;
  expectedCount: number;
  detectedCount: number;
  presentedCount: number;
  exactCount: number;
  candidateCount: number;
  hiddenCount: number;
  presentedMatchedCount: number;
  exactMatchedCount: number;
  catalogMatchedCount: number;
  expectedProducts: ProductEvaluation[];
}

function normalizeText(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  const bSet = new Set(b);
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function includesNormalized(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const left = normalizeText(haystack);
  const right = normalizeText(needle);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function scoreExpectedAgainstDetected(expected: ExpectedProduct, product: DetectedProduct): number {
  const expectedNameTokens = tokenize(expected.name);
  const expectedBrandTokens = tokenize(expected.brand);
  const expectedType = normalizeText(expected.type);

  const detectedNameScore = Math.max(
    jaccard(expectedNameTokens, tokenize(product.aiDetectedName)),
    jaccard(expectedNameTokens, tokenize(product.matchedProductName)),
  );

  let brandScore = 0;
  if (!expected.brand) {
    brandScore = 0.3;
  } else if (
    includesNormalized(product.aiDetectedBrand, expected.brand) ||
    includesNormalized(product.matchedProductBrand, expected.brand)
  ) {
    brandScore = 1;
  } else {
    brandScore = Math.max(
      jaccard(expectedBrandTokens, tokenize(product.aiDetectedBrand)),
      jaccard(expectedBrandTokens, tokenize(product.matchedProductBrand)),
    );
  }

  let typeScore = 0;
  if (!expected.type) {
    typeScore = 0.2;
  } else if (
    includesNormalized(product.aiDetectedType, expected.type) ||
    includesNormalized(product.matchedProductType, expected.type)
  ) {
    typeScore = 1;
  }

  const score = detectedNameScore * 0.65 + brandScore * 0.25 + typeScore * 0.1;
  return Math.round(score * 100) / 100;
}

function scoreExpectedAgainstCatalog(expected: ExpectedProduct, product: DetectedProduct): number {
  if (!product.matchedProductName && !product.matchedProductBrand) return 0;
  const expectedNameTokens = tokenize(expected.name);
  const expectedBrandTokens = tokenize(expected.brand);

  const nameScore = jaccard(expectedNameTokens, tokenize(product.matchedProductName));
  let brandScore = 0;
  if (!expected.brand) {
    brandScore = 0.3;
  } else if (includesNormalized(product.matchedProductBrand, expected.brand)) {
    brandScore = 1;
  } else {
    brandScore = jaccard(expectedBrandTokens, tokenize(product.matchedProductBrand));
  }

  const score = nameScore * 0.75 + brandScore * 0.25;
  return Math.round(score * 100) / 100;
}

function pickBestProduct(
  expected: ExpectedProduct,
  products: DetectedProduct[],
  scoreFn: (expected: ExpectedProduct, product: DetectedProduct) => number,
): { product: DetectedProduct | null; score: number } {
  let best: DetectedProduct | null = null;
  let bestScore = 0;

  for (const product of products) {
    const score = scoreFn(expected, product);
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }

  return { product: best, score: bestScore };
}

function countActualMatches(
  products: Array<DetectedProduct | PresentedProduct>,
  expectedProducts: ExpectedProduct[],
  scoreFn: (expected: ExpectedProduct, product: DetectedProduct) => number,
  threshold: number,
): number {
  let matches = 0;
  for (const product of products) {
    let bestScore = 0;
    for (const expected of expectedProducts) {
      const score = scoreFn(expected, product as DetectedProduct);
      if (score > bestScore) bestScore = score;
    }
    if (bestScore >= threshold) matches += 1;
  }
  return matches;
}

function loadDataset(filePath: string): EvaluationDataset {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as EvaluationDataset;
  if (!parsed.cases || !Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new Error("Evaluation dataset must include at least one case.");
  }
  return parsed;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function buildMarkdownReport(
  dataset: EvaluationDataset,
  summary: Record<string, number | string>,
  caseResults: CaseResult[],
): string {
  const lines: string[] = [];
  lines.push(`# ${dataset.name}`);
  lines.push("");
  if (dataset.description) {
    lines.push(dataset.description);
    lines.push("");
  }
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Cases run: ${summary.casesRun}`);
  lines.push(`- Cases failed: ${summary.casesFailed}`);
  lines.push(`- Expected products: ${summary.expectedProducts}`);
  lines.push(`- Detection recall: ${summary.detectionRecallPct}%`);
  lines.push(`- Catalog recall: ${summary.catalogRecallPct}%`);
  lines.push(`- Presented precision: ${summary.presentedPrecisionPct}%`);
  lines.push(`- Exact bucket precision: ${summary.exactPrecisionPct}%`);
  lines.push(`- Catalog match precision: ${summary.catalogPrecisionPct}%`);
  lines.push("");
  lines.push("## Cases");
  lines.push("");

  for (const result of caseResults) {
    lines.push(`### ${result.id}`);
    lines.push("");
    lines.push(`- Status: ${result.status}`);
    lines.push(`- URL: ${result.url}`);
    if (result.analysisId) lines.push(`- Analysis ID: ${result.analysisId}`);
    if (result.error) lines.push(`- Error: ${result.error}`);
    lines.push(`- Detected: ${result.detectedCount}`);
    lines.push(`- Presented: ${result.presentedCount} (${result.exactCount} exact / ${result.candidateCount} candidate / ${result.hiddenCount} hidden)`);
    lines.push("");
    lines.push("| Expected | Detected match | Detection score | Catalog match | Catalog score |");
    lines.push("| --- | --- | ---: | --- | ---: |");
    for (const product of result.expectedProducts) {
      const expectedLabel = [product.expected.brand, product.expected.name].filter(Boolean).join(" ");
      const detectedLabel = product.detectedMatch
        ? [product.detectedMatch.aiDetectedBrand, product.detectedMatch.aiDetectedName].filter(Boolean).join(" ")
        : "miss";
      const catalogLabel = product.catalogMatch?.matchedProductName
        ? [product.catalogMatch.matchedProductBrand, product.catalogMatch.matchedProductName].filter(Boolean).join(" ")
        : "miss";
      lines.push(`| ${expectedLabel} | ${detectedLabel} | ${product.detectedScore.toFixed(2)} | ${catalogLabel} | ${product.catalogScore.toFixed(2)} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  const datasetPathArg = process.argv[2] || "docs/evaluation-dataset.json";
  const datasetPath = path.resolve(process.cwd(), datasetPathArg);
  const outputDir = path.resolve(process.cwd(), "reports");

  if (!fs.existsSync(datasetPath)) {
    throw new Error(
      `Dataset file not found at ${datasetPath}. Copy docs/evaluation-dataset.example.json to docs/evaluation-dataset.json and add real cases.`,
    );
  }

  const dataset = loadDataset(datasetPath);
  const caseResults: CaseResult[] = [];
  const provider = process.env.ANALYSIS_AI_PROVIDER || "gemini";

  console.log(`[baseline] Preflighting provider: ${provider}`);
  await checkAnalysisProviderHealth(provider);

  for (const testCase of dataset.cases) {
    try {
      console.log(`\n[baseline] Running ${testCase.id}: ${testCase.url}`);
      const response = await analyzeVideo({ videoUrl: testCase.url });
      const analysisId = response.analysis?.id;
      const detectedProducts = analysisId
        ? await storage.getDetectedProducts(analysisId)
        : [];

      const expectedProducts = testCase.expectedProducts.map((expected) => {
        const detected = pickBestProduct(
          expected,
          detectedProducts,
          scoreExpectedAgainstDetected,
        );
        const catalog = pickBestProduct(
          expected,
          detectedProducts,
          scoreExpectedAgainstCatalog,
        );

        return {
          expected,
          detectedMatch: detected.score >= 0.55 ? detected.product : null,
          detectedScore: detected.score,
          catalogMatch: catalog.score >= 0.6 ? catalog.product : null,
          catalogScore: catalog.score,
        };
      });

      caseResults.push({
        id: testCase.id,
        url: testCase.url,
        status: "completed",
        analysisId,
        expectedCount: testCase.expectedProducts.length,
        detectedCount: detectedProducts.length,
        presentedCount: response.products.length,
        exactCount: response.productsExact.length,
        candidateCount: response.productsCandidates.length,
        hiddenCount: response.confidenceSummary.hiddenCount,
        presentedMatchedCount: countActualMatches(
          response.products,
          testCase.expectedProducts,
          scoreExpectedAgainstDetected,
          0.55,
        ),
        exactMatchedCount: countActualMatches(
          response.productsExact,
          testCase.expectedProducts,
          scoreExpectedAgainstDetected,
          0.55,
        ),
        catalogMatchedCount: countActualMatches(
          detectedProducts.filter((product) => Boolean(product.matchedProductName)),
          testCase.expectedProducts,
          scoreExpectedAgainstCatalog,
          0.6,
        ),
        expectedProducts,
      });
    } catch (error: any) {
      console.error(`[baseline] Failed ${testCase.id}:`, error);
      caseResults.push({
        id: testCase.id,
        url: testCase.url,
        status: "failed",
        error: error?.message || "Unknown error",
        expectedCount: testCase.expectedProducts.length,
        detectedCount: 0,
        presentedCount: 0,
        exactCount: 0,
        candidateCount: 0,
        hiddenCount: 0,
        presentedMatchedCount: 0,
        exactMatchedCount: 0,
        catalogMatchedCount: 0,
        expectedProducts: testCase.expectedProducts.map((expected) => ({
          expected,
          detectedMatch: null,
          detectedScore: 0,
          catalogMatch: null,
          catalogScore: 0,
        })),
      });
    }
  }

  const completedCases = caseResults.filter((result) => result.status === "completed");
  const expectedProducts = caseResults.reduce(
    (sum, result) => sum + result.expectedProducts.length,
    0,
  );
  const detectedHits = caseResults.reduce(
    (sum, result) =>
      sum +
      result.expectedProducts.filter((product) => product.detectedMatch).length,
    0,
  );
  const catalogHits = caseResults.reduce(
    (sum, result) =>
      sum +
      result.expectedProducts.filter(
        (product) => product.catalogMatch && (product.expected.mustMatchCatalog ?? true),
      ).length,
    0,
  );
  const presentedProducts = completedCases.reduce(
    (sum, result) => sum + result.presentedCount,
    0,
  );
  const exactProducts = completedCases.reduce(
    (sum, result) => sum + result.exactCount,
    0,
  );
  const catalogPresented = completedCases.reduce(
    (sum, result) => sum + result.detectedCount,
    0,
  );
  const presentedMatched = completedCases.reduce(
    (sum, result) => sum + result.presentedMatchedCount,
    0,
  );
  const exactMatched = completedCases.reduce(
    (sum, result) => sum + result.exactMatchedCount,
    0,
  );
  const catalogMatchedActual = completedCases.reduce(
    (sum, result) => sum + result.catalogMatchedCount,
    0,
  );

  const summary = {
    dataset: dataset.name,
    casesRun: caseResults.length,
    casesFailed: caseResults.filter((result) => result.status === "failed").length,
    expectedProducts,
    detectionRecallPct: toPercent(detectedHits, expectedProducts),
    catalogRecallPct: toPercent(catalogHits, expectedProducts),
    presentedPrecisionPct: toPercent(presentedMatched, presentedProducts),
    exactPrecisionPct: toPercent(exactMatched, exactProducts),
    catalogPrecisionPct: toPercent(catalogMatchedActual, catalogPresented),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonOut = path.join(outputDir, "baseline-latest.json");
  const mdOut = path.join(outputDir, "baseline-latest.md");
  fs.writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dataset: dataset.name,
        summary,
        caseResults,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(mdOut, buildMarkdownReport(dataset, summary, caseResults));

  console.log("\nBaseline summary");
  console.table(summary);
  console.log(`\nWrote ${jsonOut}`);
  console.log(`Wrote ${mdOut}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
