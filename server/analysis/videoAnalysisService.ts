import * as fs from "node:fs";
import { runJsonCompletion, transcribeAudio } from "../aiProvider";
import { storage } from "../storage";
import {
  downloadVideo,
  extractFrames,
  cleanupTempFiles,
  readFileAsBase64,
  getMimeType,
  getVideoMetadata,
  DEFAULT_FRAME_CONFIG,
  FIXED_FPS_CONFIG,
  type VideoMetadata,
  type ExtractFramesResult,
  type ExtractionMode,
} from "../videoDownloader";
import { normalizeProduct } from "../productNormalizer";
import { matchProduct, formatCatalogProduct } from "../productMatcher";
import { createTimer } from "../timing";
import type {
  TutorialStep,
  DebugData,
  ProductEvidence,
  InsertVideoAnalysis,
  VideoAnalysis,
  DetectedProduct,
  ConsumerAnalysisResponse,
  PresentedProduct,
  ConfidenceSummary,
  ProductConfidenceBucket,
} from "@shared/schema";

interface AnalysisResult {
  title: string;
  products: any[];
  steps: TutorialStep[];
  prompt: string;
  rawResponse: string;
  frameBase64s: string[];
}

export interface AnalyzeVideoOptions {
  videoUrl: string;
  extractionMode?: ExtractionMode;
  maxFramesOverride?: number;
  skipAudioTranscription?: boolean;
  onStatusChange?: (
    status: string,
    context: { analysisId: number; error?: string },
  ) => Promise<void> | void;
}

export type AnalyzeVideoResponse = ConsumerAnalysisResponse;

function detectPlatform(url: string): string {
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("instagram.com")) return "Instagram";
  return "Video";
}

async function analyzeVideoWithGemini(
  framePaths: string[],
  metadata: VideoMetadata,
  audioTranscript: string | null = null,
): Promise<AnalysisResult> {
  const images = framePaths.map((framePath) => ({
    mimeType: getMimeType(framePath),
    data: readFileAsBase64(framePath),
  }));

  const frameBase64s = images.map(
    (image) => `data:${image.mimeType};base64,${image.data}`,
  );

  const transcriptSection = audioTranscript
    ? `\n\nAUDIO TRANSCRIPT (what the creator says in the video):\n${audioTranscript.slice(0, 3000)}\n\nUse this transcript to help identify products the creator mentions by name, brand recommendations, shade names, and application tips they describe verbally.`
    : "";

  const prompt = `You are an expert beauty product analyst. I'm showing you ${framePaths.length} frames extracted from a makeup/beauty tutorial video.

VIDEO METADATA:
- Title: ${metadata.title}
- Creator: ${metadata.uploader}
- Description: ${metadata.description.slice(0, 500)}
- Platform: ${metadata.platform}${transcriptSection}

TASK: Analyze these video frames and audio transcript carefully to identify:
1. All visible beauty/makeup products
2. Products mentioned verbally in the transcript
3. The makeup techniques and application steps being demonstrated
4. Any brand names, product names, or packaging you can see or hear mentioned

For each product, you MUST provide:
- The exact product name if visible on packaging OR mentioned in transcript
- The brand name if visible OR mentioned verbally (null if unknown)
- The type of product
- Color/shade if visible or mentioned
- EVIDENCE: Explain WHERE you found each piece of information
- CONFIDENCE: A score from 0.0 to 1.0

IMPORTANT: Include products that are either visible in frames OR mentioned by name in the transcript. Do NOT make up products that aren't seen or mentioned.

Respond in this exact JSON format:
{
  "title": "Descriptive title for this tutorial (max 50 chars)",
  "products": [
    {
      "name": "Exact product name if visible/mentioned, or descriptive name like 'Pink Lip Gloss'",
      "brand": "Brand name if visible/mentioned, otherwise null",
      "description": "Brief description of how it appears to be used",
      "type": "foundation|concealer|lipstick|lip_gloss|mascara|blush|eyeshadow|primer|setting_spray|bronzer|highlighter|powder|eyeliner|brow|contour|lip_liner",
      "colorShade": "Color or shade name if visible/mentioned",
      "evidence": {
        "visual": "What you saw in the video frames. Null if not visually identified.",
        "audio": "What was said in the transcript. Null if not mentioned.",
        "metadata": "Info from video title/description. Null if not in metadata."
      },
      "confidence": 0.85
    }
  ],
  "steps": [
    {
      "stepNumber": 1,
      "instruction": "Detailed step instruction based on what you observe and hear",
      "productUsed": "Product name used in this step if applicable"
    }
  ]
}`;

  const completion = await runJsonCompletion<{
    title?: string;
    products?: any[];
    steps?: TutorialStep[];
  }>({
    prompt,
    images,
  });

  if (completion.parsed) {
    return {
      title: completion.parsed.title || metadata.title.slice(0, 50) || "Beauty Tutorial",
      products: completion.parsed.products || [],
      steps: completion.parsed.steps || [],
      prompt,
      rawResponse: completion.text,
      frameBase64s,
    };
  }

  return {
    title: metadata.title.slice(0, 50) || "Beauty Tutorial",
    products: [],
    steps: [],
    prompt,
    rawResponse: completion.text,
    frameBase64s,
  };
}

async function transcribeAudioWithGemini(audioPath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(audioPath)) {
      return null;
    }
    return await transcribeAudio({
      mimeType: getMimeType(audioPath),
      data: readFileAsBase64(audioPath),
    });
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return null;
  }
}

async function persistDetectedProducts(
  analysisId: number,
  products: any[],
): Promise<void> {
  await Promise.all(
    (products || []).map(async (product: any) => {
      const evidence: ProductEvidence = product.evidence || {
        visual: null,
        audio: null,
        metadata: null,
      };

      const normalized = normalizeProduct(
        product.name || "",
        product.brand,
        product.type,
      );

      const detectedProduct = await storage.createDetectedProduct({
        videoAnalysisId: analysisId,
        aiDetectedName: product.name,
        aiDetectedBrand: product.brand || null,
        aiDetectedType: product.type || null,
        aiDetectedColor: product.colorShade || null,
        aiDetectedDescription: product.description,
        aiConfidence: product.confidence?.toString() || null,
        aiEvidence: evidence,
        normalizedBrandSlug: normalized.brandSlug,
        normalizedCategoryKey: normalized.categoryKey,
        normalizedNameTokens: normalized.nameTokens,
      });

      const { match, score } = await matchProduct(normalized);
      if (!match) return;

      const catalog = formatCatalogProduct(match);
      await storage.updateDetectedProduct(detectedProduct.id, {
        matchedProductId:
          match.source === "makeup_api" && Number.isInteger(Number(match.sourceId))
            ? Number(match.sourceId)
            : null,
        matchedProductName: catalog.catalogName,
        matchedProductBrand: catalog.catalogBrand,
        matchedProductImage: catalog.catalogImageUrl,
        matchedProductPrice: catalog.catalogPrice?.toString() || null,
        matchedProductType: match.productType,
        matchedProductUrl: catalog.catalogProductUrl,
        matchedProductDescription: catalog.catalogDescription,
        matchedProductColors: catalog.catalogColors.map((c) => ({
          hex_value: c.hex,
          colour_name: c.name,
        })),
        matchScore: score,
      });
    }),
  );
}

function getEvidenceScore(product: DetectedProduct): number {
  const evidence = product.aiEvidence;
  if (!evidence) return 0;

  const evidenceCount = [evidence.visual, evidence.audio, evidence.metadata].filter(
    Boolean,
  ).length;

  if (evidenceCount >= 3) return 1;
  if (evidenceCount === 2) return 0.7;
  if (evidenceCount === 1) return 0.4;
  return 0;
}

function scorePresentedProduct(product: DetectedProduct): number {
  const aiConfidence = Number(product.aiConfidence || 0);
  const matchScore = product.matchScore?.overall || 0;
  const evidenceScore = getEvidenceScore(product);

  const weightedScore =
    aiConfidence * 0.65 + matchScore * 0.25 + evidenceScore * 0.1;

  return Math.round(weightedScore * 100) / 100;
}

function getConfidenceBucket(product: DetectedProduct): ProductConfidenceBucket {
  const aiConfidence = Number(product.aiConfidence || 0);
  const matchScore = product.matchScore?.overall || 0;
  const weightedScore = scorePresentedProduct(product);
  const hasCatalogMatch = Boolean(product.matchedProductName || product.matchedProductUrl);

  if (hasCatalogMatch && aiConfidence >= 0.8 && matchScore >= 0.7 && weightedScore >= 0.75) {
    return "exact";
  }

  if (weightedScore >= 0.45 && Boolean(product.aiDetectedName || product.matchedProductName)) {
    return "candidate";
  }

  return "hidden";
}

function getConfidenceLabel(bucket: ProductConfidenceBucket): string {
  switch (bucket) {
    case "exact":
      return "High confidence";
    case "candidate":
      return "Possible match";
    default:
      return "Hidden";
  }
}

function presentProduct(product: DetectedProduct): PresentedProduct {
  const confidenceBucket = getConfidenceBucket(product);
  return {
    ...product,
    confidenceBucket,
    confidenceScore: scorePresentedProduct(product),
    confidenceLabel: getConfidenceLabel(confidenceBucket),
  };
}

function summarizeProducts(products: PresentedProduct[]): ConfidenceSummary {
  return {
    exactCount: products.filter((product) => product.confidenceBucket === "exact")
      .length,
    candidateCount: products.filter(
      (product) => product.confidenceBucket === "candidate",
    ).length,
    hiddenCount: products.filter((product) => product.confidenceBucket === "hidden")
      .length,
  };
}

export function buildConsumerAnalysisResponse(
  analysis: VideoAnalysis | undefined,
  products: DetectedProduct[],
  tutorialSteps: TutorialStep[],
  warning?: string,
): ConsumerAnalysisResponse {
  const presentedProducts = products.map(presentProduct);

  return {
    analysis,
    products: presentedProducts.filter(
      (product) => product.confidenceBucket !== "hidden",
    ),
    productsExact: presentedProducts.filter(
      (product) => product.confidenceBucket === "exact",
    ),
    productsCandidates: presentedProducts.filter(
      (product) => product.confidenceBucket === "candidate",
    ),
    tutorialSteps,
    confidenceSummary: summarizeProducts(presentedProducts),
    warning,
  };
}

async function analyzeFromMetadataOnly(
  analysis: VideoAnalysis,
  videoUrl: string,
  platform: string,
): Promise<AnalyzeVideoResponse> {
  let metadata: VideoMetadata;
  try {
    metadata = await getVideoMetadata(videoUrl);
  } catch {
    metadata = {
      title: "Beauty Tutorial",
      description: "",
      duration: 0,
      uploader: "Unknown",
      uploadDate: "",
      viewCount: 0,
      likeCount: 0,
      commentCount: 0,
      thumbnailUrl: "",
      platform,
      originalUrl: videoUrl,
    };
  }

  const fallbackPrompt = `You are a beauty product expert. Based on this video metadata, predict what beauty products and tutorial steps might be in this video.

VIDEO INFO:
- Title: ${metadata.title}
- Creator: ${metadata.uploader}
- Description: ${metadata.description.slice(0, 1000)}
- Platform: ${metadata.platform}

Respond in this exact JSON format:
{
  "title": "Descriptive title (max 50 chars)",
  "products": [
    {"name": "Product Name", "brand": null, "description": "Brief description", "type": "foundation|lipstick|mascara|blush|eyeshadow|etc", "colorShade": null}
  ],
  "steps": [
    {"stepNumber": 1, "instruction": "Step instruction", "productUsed": "Product name"}
  ]
}`;

  const fallbackResponse = await runJsonCompletion<{
    title?: string;
    products?: any[];
    steps?: TutorialStep[];
  }>({
    prompt: fallbackPrompt,
  });
  const responseText = fallbackResponse.text || "";
  let analysisData = {
    title: metadata.title.slice(0, 50) || "Beauty Tutorial",
    products: [] as any[],
    steps: [] as TutorialStep[],
  };

  if (fallbackResponse.parsed) {
    analysisData = {
      title: fallbackResponse.parsed.title || analysisData.title,
      products: fallbackResponse.parsed.products || [],
      steps: fallbackResponse.parsed.steps || [],
    };
  }

  await storage.updateVideoAnalysis(analysis.id, {
    title: analysisData.title || metadata.title.slice(0, 50),
    thumbnailUrl: metadata.thumbnailUrl,
    status: "completed",
    tutorialSteps: analysisData.steps || [],
  });

  await persistDetectedProducts(analysis.id, analysisData.products);

  return buildConsumerAnalysisResponse(
    await storage.getVideoAnalysis(analysis.id),
    await storage.getDetectedProducts(analysis.id),
    analysisData.steps || [],
    "Video download failed, analysis based on metadata only",
  );
}

export async function analyzeVideo({
  videoUrl,
  extractionMode = "scene_change",
  maxFramesOverride,
  skipAudioTranscription = false,
  onStatusChange,
}: AnalyzeVideoOptions): Promise<AnalyzeVideoResponse> {
  const mode: ExtractionMode =
    extractionMode === "fixed_fps" ? "fixed_fps" : "scene_change";
  const baseFrameConfig =
    mode === "fixed_fps" ? FIXED_FPS_CONFIG : DEFAULT_FRAME_CONFIG;
  const frameConfig = maxFramesOverride
    ? {
        ...baseFrameConfig,
        maxFrames: Math.max(baseFrameConfig.minFrames, maxFramesOverride),
      }
    : baseFrameConfig;

  const timer = createTimer();
  timer.setVideoUrl(videoUrl);
  timer.setExtractionMode(mode);

  const platform = detectPlatform(videoUrl);

  timer.startStage("db_create_analysis");
  const analysis = await storage.createVideoAnalysis({
    videoUrl,
    platform,
    status: "downloading",
  } satisfies InsertVideoAnalysis);
  timer.endStage();
  timer.setAnalysisId(analysis.id);

  await onStatusChange?.("downloading", { analysisId: analysis.id });

  let downloadResult:
    | Awaited<ReturnType<typeof downloadVideo>>
    | undefined;
  let extractResult: ExtractFramesResult = {
    framePaths: [],
    duration: 0,
    frameCount: 0,
    mode,
  };

  try {
    timer.startStage("download_video");
    downloadResult = await downloadVideo(videoUrl);
    timer.endStage();

    timer.startStage("db_update_status_extracting");
    await storage.updateVideoAnalysis(analysis.id, {
      title: downloadResult.metadata.title.slice(0, 100),
      thumbnailUrl: downloadResult.metadata.thumbnailUrl,
      status: "extracting_frames",
    });
    timer.endStage();
    await onStatusChange?.("extracting_frames", { analysisId: analysis.id });

    timer.startStage("frame_extraction");
    extractResult = await extractFrames(downloadResult.videoPath, frameConfig);
    timer.endStage();
    timer.setFrameCount(extractResult.frameCount);
    timer.setVideoDuration(extractResult.duration);

    if (extractResult.framePaths.length === 0) {
      throw new Error("Could not extract frames from video");
    }

    timer.startStage("db_update_status_analyzing");
    await storage.updateVideoAnalysis(analysis.id, { status: "analyzing" });
    timer.endStage();
    await onStatusChange?.("analyzing", { analysisId: analysis.id });

    let audioTranscript: string | null = null;
    if (downloadResult.audioPath && !skipAudioTranscription) {
      timer.startStage("audio_transcription");
      audioTranscript = await transcribeAudioWithGemini(downloadResult.audioPath);
      timer.endStage();
    }

    timer.startStage("ai_video_analysis");
    const analysisData = await analyzeVideoWithGemini(
      extractResult.framePaths,
      downloadResult.metadata,
      audioTranscript,
    );
    timer.endStage();

    const timingReport = timer.getReport();
    const debugData: DebugData = {
      frames: analysisData.frameBase64s,
      metadata: downloadResult.metadata,
      audioTranscript,
      aiPrompt: analysisData.prompt,
      aiResponse: analysisData.rawResponse,
      frameCount: extractResult.framePaths.length,
      processingTimeMs: timingReport.totalDurationMs,
      extractionMode: mode,
      sceneTimestamps: extractResult.sceneTimestamps,
      timingReport,
    };

    timer.startStage("db_update_analysis_complete");
    await storage.updateVideoAnalysis(analysis.id, {
      title: analysisData.title || downloadResult.metadata.title.slice(0, 50),
      status: "completed",
      tutorialSteps: analysisData.steps || [],
      debugData,
    });
    timer.endStage();

    timer.startStage("product_normalization_and_matching");
    await persistDetectedProducts(analysis.id, analysisData.products);
    timer.endStage();

    timer.startStage("db_fetch_final_results");
    const finalProducts = await storage.getDetectedProducts(analysis.id);
    const updatedAnalysis = await storage.getVideoAnalysis(analysis.id);
    timer.endStage();

    timer.logReport();
    await onStatusChange?.("completed", { analysisId: analysis.id });

    return buildConsumerAnalysisResponse(
      updatedAnalysis,
      finalProducts,
      analysisData.steps || [],
    );
  } catch (error: any) {
    console.error("Video processing error:", error);

    try {
      const fallbackResult = await analyzeFromMetadataOnly(
        analysis,
        videoUrl,
        platform,
      );
      await onStatusChange?.("completed", { analysisId: analysis.id });
      return fallbackResult;
    } catch (fallbackError: any) {
      await storage.updateVideoAnalysis(analysis.id, { status: "failed" });
      await onStatusChange?.("failed", {
        analysisId: analysis.id,
        error: fallbackError?.message || error?.message,
      });
      throw fallbackError;
    }
  } finally {
    if (downloadResult) {
      cleanupTempFiles(downloadResult.videoPath);
    }
  }
}
