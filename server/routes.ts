import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import { eq, desc, and, sql } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import {
  downloadVideo,
  extractFrames,
  cleanupTempFiles,
  readFileAsBase64,
  getMimeType,
  getVideoMetadata,
  calculateFrameCount,
  DEFAULT_FRAME_CONFIG,
  FIXED_FPS_CONFIG,
  type VideoMetadata,
  type FrameExtractionConfig,
  type ExtractFramesResult,
  type ExtractionMode,
} from "./videoDownloader";
import { normalizeProduct } from "./productNormalizer";
import { matchProduct, formatCatalogProduct } from "./productMatcher";
import { createTimer, type TimingReport } from "./timing";
import type {
  TutorialStep,
  SkinToneData,
  DebugData,
  ProductEvidence,
} from "@shared/schema";
import {
  creators as creatorsTable,
  posts as postsTable,
  creatorFeatures as creatorFeaturesTable,
  rankingSnapshots as rankingSnapshotsTable,
  rankingEntries as rankingEntriesTable,
  jobs as jobsTable,
  humanLabels as humanLabelsTable,
} from "../shared/schema";
import { upsertCreator, savePosts, CSVPostsAdapter } from "./ranking/adapter";
import { enqueueJob } from "./ranking/jobRunner";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const MAKEUP_API_BASE = "http://makeup-api.herokuapp.com/api/v1";

async function searchMakeupProducts(query: string): Promise<any[]> {
  try {
    const searchTerms = query.toLowerCase().split(" ").filter(Boolean);
    const url = `${MAKEUP_API_BASE}/products.json`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const products = await response.json();

    const matches = products.filter((product: any) => {
      const name = (product.name || "").toLowerCase();
      const brand = (product.brand || "").toLowerCase();
      const type = (product.product_type || "").toLowerCase();

      return searchTerms.some(
        (term: string) =>
          name.includes(term) || brand.includes(term) || type.includes(term),
      );
    });

    return matches.slice(0, 5);
  } catch (error) {
    console.error("Error searching makeup products:", error);
    return [];
  }
}

function detectPlatform(url: string): string {
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("instagram.com")) return "Instagram";
  return "Video";
}

interface AnalysisResult {
  title: string;
  products: any[];
  steps: TutorialStep[];
  prompt: string;
  rawResponse: string;
  frameBase64s: string[];
}

async function analyzeVideoWithGemini(
  framePaths: string[],
  metadata: VideoMetadata,
  audioTranscript: string | null = null,
): Promise<AnalysisResult> {
  const imageParts = framePaths.map((framePath) => ({
    inlineData: {
      mimeType: getMimeType(framePath),
      data: readFileAsBase64(framePath),
    },
  }));

  const frameBase64s = imageParts.map(
    (part) => `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
  );

  const transcriptSection = audioTranscript
    ? `\n\nAUDIO TRANSCRIPT (what the creator says in the video):
${audioTranscript.slice(0, 3000)}

Use this transcript to help identify products the creator mentions by name, brand recommendations, shade names, and application tips they describe verbally.`
    : "";

  const prompt = `You are an expert beauty product analyst. I'm showing you ${framePaths.length} frames extracted from a makeup/beauty tutorial video.

VIDEO METADATA:
- Title: ${metadata.title}
- Creator: ${metadata.uploader}
- Description: ${metadata.description.slice(0, 500)}
- Platform: ${metadata.platform}${transcriptSection}

TASK: Analyze these video frames and audio transcript carefully to identify:
1. All visible beauty/makeup products (look for product bottles, tubes, palettes, brushes, applicators)
2. Products mentioned verbally in the transcript (brand names, product names, shade recommendations)
3. The makeup techniques and application steps being demonstrated
4. Any brand names, product names, or packaging you can see or hear mentioned

For each product, you MUST provide:
- The exact product name if visible on packaging OR mentioned in transcript
- The brand name if visible OR mentioned verbally (null if unknown)
- The type of product
- Color/shade if visible or mentioned
- EVIDENCE: Explain WHERE you found each piece of information (visual frame, audio transcript, or video metadata)
- CONFIDENCE: A score from 0.0 to 1.0 indicating how certain you are about this product identification

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
        "visual": "What you saw in the video frames (e.g., 'Visible MAC logo on compact', 'Pink tube with gold cap'). Null if not visually identified.",
        "audio": "What was said in the transcript (e.g., 'Creator says my favorite Charlotte Tilbury lipstick'). Null if not mentioned.",
        "metadata": "Info from video title/description (e.g., 'Brand listed in video description'). Null if not in metadata."
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
}

CONFIDENCE SCORING GUIDE:
- 0.9-1.0: Brand AND exact product name clearly visible or stated
- 0.7-0.9: Brand known, product type clear, but exact name uncertain
- 0.5-0.7: Only product type identifiable, brand uncertain
- 0.3-0.5: General category only (e.g., "some kind of lipstick")
- Below 0.3: Very uncertain, possibly misidentified

Be thorough but accurate - include what you can see in frames AND what is mentioned in the transcript.`;

  const contents = [
    {
      role: "user" as const,
      parts: [{ text: prompt }, ...imageParts],
    },
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
  });

  const responseText = response.text || "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ...parsed,
        prompt,
        rawResponse: responseText,
        frameBase64s,
      };
    }
  } catch (parseError) {
    console.error("Error parsing AI response:", parseError);
  }

  return {
    title: metadata.title.slice(0, 50) || "Beauty Tutorial",
    products: [],
    steps: [],
    prompt,
    rawResponse: responseText,
    frameBase64s,
  };
}

async function transcribeAudioWithGemini(
  audioPath: string,
): Promise<string | null> {
  try {
    if (!fs.existsSync(audioPath)) {
      console.log("Audio file not found for transcription");
      return null;
    }

    const audioBase64 = readFileAsBase64(audioPath);
    const mimeType = getMimeType(audioPath);

    console.log(`Transcribing audio: ${audioPath} (${mimeType})`);

    const contents = [
      {
        role: "user" as const,
        parts: [
          {
            text: `Please transcribe the audio in this file. Extract all spoken words, including any product names, brand names, or beauty-related terms mentioned. If there's no speech or the audio is unclear, indicate that. Provide only the transcription text without any additional commentary.`,
          },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
    });

    const transcription = response.text?.trim() || null;
    console.log(`Transcription complete: ${transcription?.slice(0, 100)}...`);
    return transcription;
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return null;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/video-analyses", async (req: Request, res: Response) => {
    try {
      const analyses = await storage.getAllVideoAnalyses();
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching video analyses:", error);
      res.status(500).json({ error: "Failed to fetch video analyses" });
    }
  });

  app.get("/api/video-analyses/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      const analysis = await storage.getVideoAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      const products = await storage.getDetectedProducts(id);
      res.json({ analysis, products });
    } catch (error) {
      console.error("Error fetching video analysis:", error);
      res.status(500).json({ error: "Failed to fetch video analysis" });
    }
  });

  app.get(
    "/api/video-analyses/:id/debug",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id as string);
        const analysis = await storage.getVideoAnalysis(id);
        if (!analysis) {
          return res.status(404).json({ error: "Analysis not found" });
        }

        if (!analysis.debugData) {
          return res
            .status(404)
            .json({ error: "No debug data available for this analysis" });
        }

        const products = await storage.getDetectedProducts(id);

        res.json({
          id: analysis.id,
          videoUrl: analysis.videoUrl,
          title: analysis.title,
          status: analysis.status,
          debugData: analysis.debugData,
          products: products,
          createdAt: analysis.createdAt,
        });
      } catch (error) {
        console.error("Error fetching debug data:", error);
        res.status(500).json({ error: "Failed to fetch debug data" });
      }
    },
  );

  app.post("/api/analyze-video", async (req: Request, res: Response) => {
    try {
      const { videoUrl, extractionMode, forceReprocess } = req.body;
      const mode: ExtractionMode =
        extractionMode === "fixed_fps" ? "fixed_fps" : "scene_change";
      const frameConfig =
        mode === "fixed_fps" ? FIXED_FPS_CONFIG : DEFAULT_FRAME_CONFIG;

      if (!videoUrl) {
        return res.status(400).json({ error: "Video URL is required" });
      }

      // Fast-match: check if this URL has already been processed
      if (!forceReprocess) {
        const existing = await storage.getVideoAnalysisByUrl(videoUrl);
        if (existing && existing.status === "completed") {
          console.log(
            `Fast-match hit: Video already analyzed (id: ${existing.id})`,
          );
          const products = await storage.getDetectedProducts(existing.id);
          return res.json({
            analysis: existing,
            products,
            tutorialSteps: existing.tutorialSteps || [],
            cached: true,
          });
        }
      }

      const timer = createTimer();
      timer.setVideoUrl(videoUrl);
      timer.setExtractionMode(mode);

      const platform = detectPlatform(videoUrl);

      timer.startStage("db_create_analysis");
      const analysis = await storage.createVideoAnalysis({
        videoUrl,
        platform,
        status: "downloading",
      });
      timer.endStage();
      timer.setAnalysisId(analysis.id);

      console.log(`Starting video analysis for: ${videoUrl} (mode: ${mode})`);

      let downloadResult;
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
        console.log("Video downloaded, metadata:", downloadResult.metadata);

        timer.startStage("db_update_status_extracting");
        await storage.updateVideoAnalysis(analysis.id, {
          title: downloadResult.metadata.title.slice(0, 100),
          thumbnailUrl: downloadResult.metadata.thumbnailUrl,
          status: "extracting_frames",
        });
        timer.endStage();

        timer.startStage("frame_extraction");
        extractResult = await extractFrames(
          downloadResult.videoPath,
          frameConfig,
        );
        timer.endStage();
        timer.setFrameCount(extractResult.frameCount);
        timer.setVideoDuration(extractResult.duration);
        console.log(
          `Extracted ${extractResult.framePaths.length} frames from ${extractResult.duration}s video (mode: ${extractResult.mode})`,
        );

        if (extractResult.framePaths.length === 0) {
          throw new Error("Could not extract frames from video");
        }

        timer.startStage("db_update_status_analyzing");
        await storage.updateVideoAnalysis(analysis.id, {
          status: "analyzing",
        });
        timer.endStage();

        let audioTranscript: string | null = null;
        if (downloadResult.audioPath) {
          console.log("Starting audio transcription...");
          timer.startStage("audio_transcription");
          audioTranscript = await transcribeAudioWithGemini(
            downloadResult.audioPath,
          );
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

        console.log("AI analysis complete:", {
          title: analysisData.title,
          productCount: analysisData.products.length,
          stepCount: analysisData.steps.length,
          hasTranscript: !!audioTranscript,
        });

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
          title:
            analysisData.title || downloadResult.metadata.title.slice(0, 50),
          status: "completed",
          tutorialSteps: analysisData.steps || [],
          debugData,
        });
        timer.endStage();

        timer.startStage("product_normalization_and_matching");
        const createdProducts = await Promise.all(
          (analysisData.products || []).map(async (product: any) => {
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
              videoAnalysisId: analysis.id,
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

            if (match) {
              const catalog = formatCatalogProduct(match);
              await storage.updateDetectedProduct(detectedProduct.id, {
                matchedProductId: match.id,
                matchedProductName: catalog.catalogName,
                matchedProductBrand: catalog.catalogBrand,
                matchedProductImage: catalog.catalogImageUrl,
                matchedProductPrice: catalog.catalogPrice?.toString() || null,
                matchedProductType: match.product_type,
                matchedProductUrl: catalog.catalogProductUrl,
                matchedProductDescription: catalog.catalogDescription,
                matchedProductColors: catalog.catalogColors.map((c) => ({
                  hex_value: c.hex,
                  colour_name: c.name,
                })),
                matchScore: score,
              });
            }

            return detectedProduct;
          }),
        );
        timer.endStage();

        timer.startStage("db_fetch_final_results");
        const finalProducts = await storage.getDetectedProducts(analysis.id);
        const updatedAnalysis = await storage.getVideoAnalysis(analysis.id);
        timer.endStage();

        timer.logReport();

        if (downloadResult) {
          cleanupTempFiles(downloadResult.videoPath);
        }

        res.json({
          analysis: updatedAnalysis,
          products: finalProducts,
          tutorialSteps: analysisData.steps || [],
        });
      } catch (downloadError: any) {
        console.error("Video processing error:", downloadError);

        if (downloadResult) {
          cleanupTempFiles(downloadResult.videoPath);
        }

        console.log("Falling back to metadata-only analysis");

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

Analyze the title and description to identify:
1. What type of makeup look this might be (glam, natural, bold, etc.)
2. What products would typically be used
3. What steps would be involved

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

        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: fallbackPrompt }] }],
        });

        const responseText = fallbackResponse.text || "";
        let analysisData = {
          title: metadata.title.slice(0, 50) || "Beauty Tutorial",
          products: [] as any[],
          steps: [] as TutorialStep[],
        };

        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysisData = JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          console.error("Error parsing fallback AI response:", parseError);
        }

        await storage.updateVideoAnalysis(analysis.id, {
          title: analysisData.title || metadata.title.slice(0, 50),
          thumbnailUrl: metadata.thumbnailUrl,
          status: "completed",
          tutorialSteps: analysisData.steps || [],
        });

        await Promise.all(
          (analysisData.products || []).map(async (product: any) => {
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
              videoAnalysisId: analysis.id,
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

            if (match) {
              const catalog = formatCatalogProduct(match);
              await storage.updateDetectedProduct(detectedProduct.id, {
                matchedProductId: match.id,
                matchedProductName: catalog.catalogName,
                matchedProductBrand: catalog.catalogBrand,
                matchedProductImage: catalog.catalogImageUrl,
                matchedProductPrice: catalog.catalogPrice?.toString() || null,
                matchedProductType: match.product_type,
                matchedProductUrl: catalog.catalogProductUrl,
                matchedProductDescription: catalog.catalogDescription,
                matchedProductColors: catalog.catalogColors.map((c) => ({
                  hex_value: c.hex,
                  colour_name: c.name,
                })),
                matchScore: score,
              });
            }

            return detectedProduct;
          }),
        );

        const finalProducts = await storage.getDetectedProducts(analysis.id);
        const updatedAnalysis = await storage.getVideoAnalysis(analysis.id);

        res.json({
          analysis: updatedAnalysis,
          products: finalProducts,
          tutorialSteps: analysisData.steps || [],
          warning: "Video download failed, analysis based on metadata only",
        });
      }
    } catch (error) {
      console.error("Error analyzing video:", error);
      res.status(500).json({ error: "Failed to analyze video" });
    }
  });

  app.get("/api/saved-looks", async (req: Request, res: Response) => {
    try {
      const looks = await storage.getAllSavedLooks();
      res.json(looks);
    } catch (error) {
      console.error("Error fetching saved looks:", error);
      res.status(500).json({ error: "Failed to fetch saved looks" });
    }
  });

  app.get(
    "/api/saved-looks/:id/products",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id as string);
        const look = await storage.getSavedLook(id);
        if (!look) {
          return res.status(404).json({ error: "Look not found" });
        }

        const videoAnalysis = await storage.getVideoAnalysis(
          look.videoAnalysisId,
        );
        const products = await storage.getDetectedProducts(
          look.videoAnalysisId,
        );

        const totalPrice = products.reduce((sum, p) => {
          const price = parseFloat(p.matchedProductPrice || "0");
          return sum + price;
        }, 0);

        res.json({
          videoAnalysis,
          products,
          totalPrice: totalPrice.toFixed(2),
        });
      } catch (error) {
        console.error("Error fetching look products:", error);
        res.status(500).json({ error: "Failed to fetch look products" });
      }
    },
  );

  app.post("/api/saved-looks", async (req: Request, res: Response) => {
    try {
      const { videoAnalysisId, title } = req.body;

      if (!videoAnalysisId) {
        return res.status(400).json({ error: "Video analysis ID is required" });
      }

      const look = await storage.createSavedLook({
        videoAnalysisId,
        title: title || "My Look",
      });

      res.status(201).json(look);
    } catch (error) {
      console.error("Error saving look:", error);
      res.status(500).json({ error: "Failed to save look" });
    }
  });

  app.delete("/api/saved-looks/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string);
      await storage.deleteSavedLook(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting look:", error);
      res.status(500).json({ error: "Failed to delete look" });
    }
  });

  app.get("/api/user-profile", async (req: Request, res: Response) => {
    try {
      const profile = await storage.getUserProfile();
      if (!profile) {
        const newProfile = await storage.createOrUpdateUserProfile({
          displayName: "Beauty Enthusiast",
        });
        return res.json(newProfile);
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  app.post("/api/analyze-skin-tone", async (req: Request, res: Response) => {
    try {
      const { imageUri } = req.body;

      if (!imageUri) {
        return res.status(400).json({ error: "Image URI is required" });
      }

      const prompt = `Analyze this selfie image for skin tone. Provide:
1. A hex color code that best represents the skin tone
2. The undertone (warm, cool, or neutral)
3. The depth (fair, light, medium, tan, or deep)

Respond in this exact JSON format:
{
  "hexColor": "#E5B087",
  "undertone": "warm",
  "depth": "medium"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const responseText = response.text || "";
      let skinToneData: SkinToneData = {
        hexColor: "#D4A574",
        undertone: "neutral",
        depth: "medium",
      };

      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          skinToneData = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error("Error parsing skin tone response:", parseError);
      }

      const currentProfile = await storage.getUserProfile();
      const selfieUrls = currentProfile?.selfieUrls || [];

      const updatedProfile = await storage.createOrUpdateUserProfile({
        skinToneData,
        selfieUrls: [...selfieUrls, imageUri].slice(-5),
      });

      res.json({ profile: updatedProfile, skinToneData });
    } catch (error) {
      console.error("Error analyzing skin tone:", error);
      res.status(500).json({ error: "Failed to analyze skin tone" });
    }
  });

  app.put("/api/user-profile", async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      const profile = await storage.createOrUpdateUserProfile(updates);
      res.json(profile);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  });

  // ========== ADMIN API ROUTES ==========

  app.get("/api/admin/analyses", async (req: Request, res: Response) => {
    try {
      const analyses = await storage.getVideoAnalysesWithProductCounts();
      const result = analyses.map((a) => ({
        id: a.id,
        videoUrl: a.videoUrl,
        platform: a.platform,
        thumbnailUrl: a.thumbnailUrl,
        title: a.title,
        status: a.status,
        stepCount: a.tutorialSteps?.length || 0,
        productCount: a.productCount,
        matchedProductCount: a.matchedProductCount,
        processingTimeMs:
          (a.debugData as any)?.timingReport?.totalDurationMs || null,
        extractionMode: (a.debugData as any)?.extractionMode || null,
        frameCount: (a.debugData as any)?.frameCount || 0,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }));
      res.json(result);
    } catch (error) {
      console.error("Error fetching admin analyses:", error);
      res.status(500).json({ error: "Failed to fetch analyses" });
    }
  });

  app.get(
    "/api/admin/analyses/:id/detail",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id as string);
        const analysis = await storage.getVideoAnalysis(id);
        if (!analysis) {
          return res.status(404).json({ error: "Analysis not found" });
        }
        const products = await storage.getDetectedProducts(id);

        const debugData = analysis.debugData as DebugData | null;

        res.json({
          id: analysis.id,
          videoUrl: analysis.videoUrl,
          platform: analysis.platform,
          thumbnailUrl: analysis.thumbnailUrl,
          title: analysis.title,
          status: analysis.status,
          tutorialSteps: analysis.tutorialSteps || [],
          createdAt: analysis.createdAt,
          updatedAt: analysis.updatedAt,
          metadata: debugData?.metadata || null,
          audioTranscript: debugData?.audioTranscript || null,
          aiPrompt: debugData?.aiPrompt || null,
          aiResponse: debugData?.aiResponse || null,
          timingReport: debugData?.timingReport || null,
          extractionMode: debugData?.extractionMode || null,
          frameCount: debugData?.frameCount || 0,
          frames: debugData?.frames || [],
          products: products.map((p) => ({
            id: p.id,
            aiDetectedName: p.aiDetectedName,
            aiDetectedBrand: p.aiDetectedBrand,
            aiDetectedType: p.aiDetectedType,
            aiDetectedColor: p.aiDetectedColor,
            aiConfidence: p.aiConfidence,
            aiEvidence: p.aiEvidence,
            matchedProductName: p.matchedProductName,
            matchedProductBrand: p.matchedProductBrand,
            matchedProductImage: p.matchedProductImage,
            matchedProductPrice: p.matchedProductPrice,
            matchedProductType: p.matchedProductType,
            matchedProductUrl: p.matchedProductUrl,
            matchScore: p.matchScore,
          })),
        });
      } catch (error) {
        console.error("Error fetching admin analysis detail:", error);
        res.status(500).json({ error: "Failed to fetch analysis detail" });
      }
    },
  );

  // Bulk queue: accepts array of URLs and processes them in background
  const processingQueue: Map<
    string,
    { status: string; analysisId?: number; error?: string }
  > = new Map();

  app.post("/api/admin/bulk-queue", async (req: Request, res: Response) => {
    try {
      const { urls } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: "URLs array is required" });
      }

      const validUrls = urls
        .map((u: string) => u.trim())
        .filter((u: string) => u.length > 0);

      const results: { url: string; status: string; analysisId?: number }[] =
        [];

      for (const url of validUrls) {
        // Check if already processed
        const existing = await storage.getVideoAnalysisByUrl(url);
        if (existing && existing.status === "completed") {
          results.push({
            url,
            status: "already_completed",
            analysisId: existing.id,
          });
          continue;
        }

        if (
          existing &&
          ["downloading", "extracting_frames", "analyzing"].includes(
            existing.status,
          )
        ) {
          results.push({
            url,
            status: "already_processing",
            analysisId: existing.id,
          });
          continue;
        }

        // Queue for background processing
        processingQueue.set(url, { status: "queued" });
        results.push({ url, status: "queued" });

        // Process in background (don't await)
        processVideoInBackground(url).catch((err) => {
          console.error(`Background processing failed for ${url}:`, err);
          processingQueue.set(url, { status: "failed", error: err.message });
        });
      }

      res.json({ queued: results.length, results });
    } catch (error) {
      console.error("Error queuing videos:", error);
      res.status(500).json({ error: "Failed to queue videos" });
    }
  });

  app.get("/api/admin/queue-status", async (req: Request, res: Response) => {
    try {
      const status: Record<string, any> = {};
      processingQueue.forEach((value, key) => {
        status[key] = value;
      });
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: "Failed to get queue status" });
    }
  });

  // Background processing function
  async function processVideoInBackground(videoUrl: string) {
    const mode: ExtractionMode = "scene_change";
    const frameConfig = DEFAULT_FRAME_CONFIG;
    const timer = createTimer();
    timer.setVideoUrl(videoUrl);
    timer.setExtractionMode(mode);

    const platform = detectPlatform(videoUrl);
    processingQueue.set(videoUrl, { status: "downloading" });

    const analysis = await storage.createVideoAnalysis({
      videoUrl,
      platform,
      status: "downloading",
    });
    timer.setAnalysisId(analysis.id);
    processingQueue.set(videoUrl, {
      status: "downloading",
      analysisId: analysis.id,
    });

    let downloadResult;
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

      processingQueue.set(videoUrl, {
        status: "extracting_frames",
        analysisId: analysis.id,
      });
      await storage.updateVideoAnalysis(analysis.id, {
        title: downloadResult.metadata.title.slice(0, 100),
        thumbnailUrl: downloadResult.metadata.thumbnailUrl,
        status: "extracting_frames",
      });

      timer.startStage("frame_extraction");
      extractResult = await extractFrames(
        downloadResult.videoPath,
        frameConfig,
      );
      timer.endStage();
      timer.setFrameCount(extractResult.frameCount);
      timer.setVideoDuration(extractResult.duration);

      if (extractResult.framePaths.length === 0) {
        throw new Error("Could not extract frames from video");
      }

      processingQueue.set(videoUrl, {
        status: "analyzing",
        analysisId: analysis.id,
      });
      await storage.updateVideoAnalysis(analysis.id, { status: "analyzing" });

      let audioTranscript: string | null = null;
      if (downloadResult.audioPath) {
        timer.startStage("audio_transcription");
        audioTranscript = await transcribeAudioWithGemini(
          downloadResult.audioPath,
        );
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

      await storage.updateVideoAnalysis(analysis.id, {
        title: analysisData.title || downloadResult.metadata.title.slice(0, 50),
        status: "completed",
        tutorialSteps: analysisData.steps || [],
        debugData,
      });

      timer.startStage("product_normalization_and_matching");
      await Promise.all(
        (analysisData.products || []).map(async (product: any) => {
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
            videoAnalysisId: analysis.id,
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
          if (match) {
            const catalog = formatCatalogProduct(match);
            await storage.updateDetectedProduct(detectedProduct.id, {
              matchedProductId: match.id,
              matchedProductName: catalog.catalogName,
              matchedProductBrand: catalog.catalogBrand,
              matchedProductImage: catalog.catalogImageUrl,
              matchedProductPrice: catalog.catalogPrice?.toString() || null,
              matchedProductType: match.product_type,
              matchedProductUrl: catalog.catalogProductUrl,
              matchedProductDescription: catalog.catalogDescription,
              matchedProductColors: catalog.catalogColors.map((c) => ({
                hex_value: c.hex,
                colour_name: c.name,
              })),
              matchScore: score,
            });
          }
        }),
      );
      timer.endStage();

      processingQueue.set(videoUrl, {
        status: "completed",
        analysisId: analysis.id,
      });
      timer.logReport();

      if (downloadResult) {
        cleanupTempFiles(downloadResult.videoPath);
      }
    } catch (error: any) {
      console.error(`Background processing error for ${videoUrl}:`, error);

      if (downloadResult) {
        cleanupTempFiles(downloadResult.videoPath);
      }

      await storage.updateVideoAnalysis(analysis.id, { status: "failed" });
      processingQueue.set(videoUrl, {
        status: "failed",
        analysisId: analysis.id,
        error: error.message,
      });
    }
  }

  // Discovery endpoint - uses YouTube Data API to find top beauty tutorial videos
  app.post("/api/admin/discover", async (req: Request, res: Response) => {
    try {
      const {
        query = "get ready with me makeup tutorial",
        sortBy = "viewCount",
        maxResults = 20,
      } = req.body;

      const youtubeApiKey = process.env.YOUTUBE_API_KEY;

      if (!youtubeApiKey) {
        // Fallback: use Gemini to suggest top beauty tutorial videos
        const suggestPrompt = `You are a beauty content expert. List ${maxResults} real, popular "${query}" videos from YouTube, TikTok, or Instagram.

For each video, provide:
- title: The video title
- url: The actual YouTube/TikTok URL (use real URLs you know exist)
- viewCount: Estimated view count
- channelName: The creator's name
- platform: youtube, tiktok, or instagram

Focus on videos from the most popular beauty creators that would be most valuable for a beauty product discovery app (high view counts, clear product usage, tutorial format).

Sort by ${sortBy === "viewCount" ? "view count (highest first)" : sortBy === "recent" ? "recency" : "relevance to beauty tutorials"}.

Respond in this exact JSON format:
{
  "videos": [
    {
      "title": "Video Title",
      "url": "https://youtube.com/watch?v=...",
      "viewCount": 1000000,
      "channelName": "Creator Name",
      "platform": "youtube",
      "thumbnailUrl": ""
    }
  ]
}`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: suggestPrompt }] }],
        });

        const responseText = response.text || "";
        try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return res.json({
              videos: parsed.videos || [],
              source: "ai_suggested",
            });
          }
        } catch (parseError) {
          console.error("Error parsing discovery response:", parseError);
        }

        return res.json({
          videos: [],
          source: "ai_suggested",
          error: "Could not generate suggestions",
        });
      }

      // Use YouTube Data API
      const order =
        sortBy === "viewCount"
          ? "viewCount"
          : sortBy === "recent"
            ? "date"
            : "relevance";
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=${order}&maxResults=${Math.min(maxResults, 50)}&videoDuration=medium&key=${youtubeApiKey}`;

      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        throw new Error(`YouTube API error: ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const videoIds =
        searchData.items?.map((item: any) => item.id.videoId).join(",") || "";

      if (!videoIds) {
        return res.json({ videos: [], source: "youtube_api" });
      }

      // Get video statistics
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${youtubeApiKey}`;
      const statsResponse = await fetch(statsUrl);
      const statsData = await statsResponse.json();

      const videos = (statsData.items || []).map((item: any) => ({
        title: item.snippet.title,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        viewCount: parseInt(item.statistics.viewCount || "0"),
        channelName: item.snippet.channelTitle,
        platform: "youtube",
        thumbnailUrl:
          item.snippet.thumbnails?.medium?.url ||
          item.snippet.thumbnails?.default?.url ||
          "",
      }));

      // Sort by view count if requested
      if (sortBy === "viewCount") {
        videos.sort((a: any, b: any) => b.viewCount - a.viewCount);
      }

      res.json({ videos, source: "youtube_api" });
    } catch (error) {
      console.error("Error discovering videos:", error);
      res.status(500).json({ error: "Failed to discover videos" });
    }
  });

  // Queue discovered videos for processing
  app.post(
    "/api/admin/queue-discovered",
    async (req: Request, res: Response) => {
      try {
        const { videos } = req.body;
        if (!Array.isArray(videos) || videos.length === 0) {
          return res.status(400).json({ error: "Videos array is required" });
        }

        const urls = videos.map((v: any) => v.url).filter((u: string) => u);

        // Reuse bulk-queue logic
        const results: { url: string; status: string; analysisId?: number }[] =
          [];

        for (const url of urls) {
          const existing = await storage.getVideoAnalysisByUrl(url);
          if (existing && existing.status === "completed") {
            results.push({
              url,
              status: "already_completed",
              analysisId: existing.id,
            });
            continue;
          }

          processingQueue.set(url, { status: "queued" });
          results.push({ url, status: "queued" });

          processVideoInBackground(url).catch((err) => {
            console.error(`Background processing failed for ${url}:`, err);
            processingQueue.set(url, { status: "failed", error: err.message });
          });
        }

        res.json({ queued: results.length, results });
      } catch (error) {
        console.error("Error queuing discovered videos:", error);
        res.status(500).json({ error: "Failed to queue discovered videos" });
      }
    },
  );

  // ========== CREATOR RANKING API ROUTES ==========

  app.get("/api/admin/creators", async (req: Request, res: Response) => {
    try {
      const allCreators = await db
        .select()
        .from(creatorsTable)
        .orderBy(creatorsTable.handle);
      res.json(allCreators);
    } catch (error) {
      console.error("Error fetching creators:", error);
      res.status(500).json({ error: "Failed to fetch creators" });
    }
  });

  app.post("/api/admin/creators", async (req: Request, res: Response) => {
    try {
      const { handle, displayName, platform, profileUrl, avatarUrl } = req.body;
      if (!handle) return res.status(400).json({ error: "Handle is required" });
      const id = await upsertCreator({
        handle,
        displayName,
        platform,
        profileUrl,
        avatarUrl,
        source: "manual",
      });
      const [creator] = await db
        .select()
        .from(creatorsTable)
        .where(eq(creatorsTable.id, id));
      res.json(creator);
    } catch (error) {
      console.error("Error creating creator:", error);
      res.status(500).json({ error: "Failed to create creator" });
    }
  });

  app.post(
    "/api/admin/creators/import-csv",
    async (req: Request, res: Response) => {
      try {
        const { creators: csvCreators } = req.body;
        if (!Array.isArray(csvCreators) || csvCreators.length === 0) {
          return res.status(400).json({ error: "creators array is required" });
        }

        const results: { handle: string; id: number; status: string }[] = [];
        const csvAdapter = new CSVPostsAdapter();

        for (const row of csvCreators) {
          try {
            const id = await upsertCreator({
              handle: row.handle,
              displayName: row.displayName,
              platform: row.platform || "tiktok",
              profileUrl: row.profileUrl,
              avatarUrl: row.avatarUrl,
              source: "csv",
            });

            if (row.posts && Array.isArray(row.posts) && row.posts.length > 0) {
              csvAdapter.loadFromRows(row.posts, row.handle);
              const rawPosts = await csvAdapter.fetchPosts(row.handle);
              await savePosts(id, rawPosts);
            }

            results.push({ handle: row.handle, id, status: "imported" });
          } catch (err: any) {
            results.push({
              handle: row.handle,
              id: 0,
              status: `error: ${err.message}`,
            });
          }
        }

        res.json({
          imported: results.filter((r) => r.status === "imported").length,
          total: results.length,
          results,
        });
      } catch (error) {
        console.error("Error importing creators:", error);
        res.status(500).json({ error: "Failed to import creators" });
      }
    },
  );

  app.get("/api/admin/creators/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(
        Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
        10,
      );
      const [creator] = await db
        .select()
        .from(creatorsTable)
        .where(eq(creatorsTable.id, id));
      if (!creator) return res.status(404).json({ error: "Creator not found" });

      const creatorPosts = await db
        .select()
        .from(postsTable)
        .where(eq(postsTable.creatorId, id))
        .orderBy(postsTable.postedAt);
      const features = await db
        .select()
        .from(creatorFeaturesTable)
        .where(eq(creatorFeaturesTable.creatorId, id));
      const entries = await db
        .select({
          entry: rankingEntriesTable,
          snapshot: rankingSnapshotsTable,
        })
        .from(rankingEntriesTable)
        .innerJoin(
          rankingSnapshotsTable,
          eq(rankingEntriesTable.snapshotId, rankingSnapshotsTable.id),
        )
        .where(eq(rankingEntriesTable.creatorId, id))
        .orderBy(rankingSnapshotsTable.snapshotDate);

      res.json({
        creator,
        posts: creatorPosts,
        features: features[0] || null,
        rankingHistory: entries.map((e) => ({
          rank: e.entry.rank,
          score: e.entry.score,
          breakdown: e.entry.scoreBreakdown,
          date: e.snapshot.snapshotDate,
          snapshotId: e.snapshot.id,
        })),
      });
    } catch (error) {
      console.error("Error fetching creator detail:", error);
      res.status(500).json({ error: "Failed to fetch creator detail" });
    }
  });

  app.get("/api/admin/ranking/latest", async (req: Request, res: Response) => {
    try {
      const [latestSnapshot] = await db
        .select()
        .from(rankingSnapshotsTable)
        .orderBy(desc(rankingSnapshotsTable.createdAt))
        .limit(1);

      if (!latestSnapshot) {
        return res.json({ snapshot: null, entries: [] });
      }

      const entries = await db
        .select({
          entry: rankingEntriesTable,
          creator: creatorsTable,
        })
        .from(rankingEntriesTable)
        .innerJoin(
          creatorsTable,
          eq(rankingEntriesTable.creatorId, creatorsTable.id),
        )
        .where(eq(rankingEntriesTable.snapshotId, latestSnapshot.id))
        .orderBy(rankingEntriesTable.rank);

      res.json({
        snapshot: latestSnapshot,
        entries: entries.map((e) => ({
          rank: e.entry.rank,
          score: e.entry.score,
          breakdown: e.entry.scoreBreakdown,
          creator: {
            id: e.creator.id,
            handle: e.creator.handle,
            displayName: e.creator.displayName,
            platform: e.creator.platform,
            avatarUrl: e.creator.avatarUrl,
            profileUrl: e.creator.profileUrl,
          },
        })),
      });
    } catch (error) {
      console.error("Error fetching latest ranking:", error);
      res.status(500).json({ error: "Failed to fetch ranking" });
    }
  });

  app.get(
    "/api/admin/ranking/snapshots",
    async (req: Request, res: Response) => {
      try {
        const snapshots = await db
          .select()
          .from(rankingSnapshotsTable)
          .orderBy(rankingSnapshotsTable.createdAt);
        res.json(snapshots);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch snapshots" });
      }
    },
  );

  app.post(
    "/api/admin/ranking/refresh",
    async (req: Request, res: Response) => {
      try {
        const jobId = await enqueueJob("full_refresh");
        res.json({
          jobId,
          status: "queued",
          message: "Full refresh job queued",
        });
      } catch (error) {
        console.error("Error starting refresh:", error);
        res.status(500).json({ error: "Failed to start refresh" });
      }
    },
  );

  app.get("/api/admin/jobs", async (req: Request, res: Response) => {
    try {
      const allJobs = await db
        .select()
        .from(jobsTable)
        .orderBy(desc(jobsTable.createdAt))
        .limit(50);
      res.json(allJobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  app.post("/api/admin/jobs", async (req: Request, res: Response) => {
    try {
      const { name, payload } = req.body;
      if (!name) return res.status(400).json({ error: "Job name is required" });
      const jobId = await enqueueJob(name, payload);
      res.json({ jobId, status: "queued" });
    } catch (error) {
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  app.get("/api/admin/diff", async (req: Request, res: Response) => {
    try {
      const snapshotAId = req.query.a ? Number(req.query.a) : undefined;
      const snapshotBId = req.query.b ? Number(req.query.b) : undefined;

      const allSnapshots = await db
        .select()
        .from(rankingSnapshotsTable)
        .orderBy(desc(rankingSnapshotsTable.createdAt));
      if (allSnapshots.length === 0) {
        return res.json({ snapshots: [], diff: null });
      }

      const snapshotB = snapshotBId
        ? allSnapshots.find((s) => s.id === snapshotBId) || allSnapshots[0]
        : allSnapshots[0];
      const snapshotA = snapshotAId
        ? allSnapshots.find((s) => s.id === snapshotAId) ||
          allSnapshots[1] ||
          null
        : allSnapshots[1] || null;

      const entriesB = await db
        .select({ entry: rankingEntriesTable, creator: creatorsTable })
        .from(rankingEntriesTable)
        .innerJoin(
          creatorsTable,
          eq(rankingEntriesTable.creatorId, creatorsTable.id),
        )
        .where(eq(rankingEntriesTable.snapshotId, snapshotB.id))
        .orderBy(rankingEntriesTable.rank);

      let entriesA: typeof entriesB = [];
      if (snapshotA) {
        entriesA = await db
          .select({ entry: rankingEntriesTable, creator: creatorsTable })
          .from(rankingEntriesTable)
          .innerJoin(
            creatorsTable,
            eq(rankingEntriesTable.creatorId, creatorsTable.id),
          )
          .where(eq(rankingEntriesTable.snapshotId, snapshotA.id))
          .orderBy(rankingEntriesTable.rank);
      }

      const labelsB = await db
        .select()
        .from(humanLabelsTable)
        .where(eq(humanLabelsTable.snapshotId, snapshotB.id));

      const labelMap: Record<
        number,
        { label: string; note: string | null; id: number }
      > = {};
      for (const l of labelsB) {
        labelMap[l.creatorId] = { label: l.label, note: l.note, id: l.id };
      }

      const rankMapA: Record<number, number> = {};
      for (const e of entriesA) {
        rankMapA[e.creator.id] = e.entry.rank;
      }

      const diffEntries = entriesB.map((e) => {
        const prevRank = rankMapA[e.creator.id];
        const rankDelta =
          prevRank !== undefined ? prevRank - e.entry.rank : null;
        const humanLabel = labelMap[e.creator.id] || null;
        return {
          rank: e.entry.rank,
          score: e.entry.score,
          breakdown: e.entry.scoreBreakdown,
          creator: {
            id: e.creator.id,
            handle: e.creator.handle,
            displayName: e.creator.displayName,
            platform: e.creator.platform,
          },
          prevRank: prevRank ?? null,
          rankDelta,
          humanLabel,
        };
      });

      const labeled = labelsB.length;
      const correct = labelsB.filter((l) => l.label === "correct").length;
      const wrong = labelsB.filter((l) => l.label === "wrong").length;
      const precision = labeled > 0 ? correct / labeled : null;

      res.json({
        snapshots: allSnapshots,
        snapshotA: snapshotA || null,
        snapshotB: snapshotB,
        diff: diffEntries,
        precision: {
          labeled,
          correct,
          wrong,
          precision,
          total: entriesB.length,
        },
      });
    } catch (error) {
      console.error("Error computing diff:", error);
      res.status(500).json({ error: "Failed to compute diff" });
    }
  });

  app.put("/api/admin/labels", async (req: Request, res: Response) => {
    try {
      const { snapshotId, creatorId, label, note } = req.body;
      if (!snapshotId || !creatorId || !label) {
        return res
          .status(400)
          .json({ error: "snapshotId, creatorId, and label are required" });
      }

      const existing = await db
        .select()
        .from(humanLabelsTable)
        .where(
          and(
            eq(humanLabelsTable.snapshotId, snapshotId),
            eq(humanLabelsTable.creatorId, creatorId),
          ),
        );

      if (existing.length > 0) {
        await db
          .update(humanLabelsTable)
          .set({ label, note: note || null, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(humanLabelsTable.id, existing[0].id));
        res.json({ updated: true, id: existing[0].id });
      } else {
        const [inserted] = await db
          .insert(humanLabelsTable)
          .values({ snapshotId, creatorId, label, note: note || null })
          .returning();
        res.json({ created: true, id: inserted.id });
      }
    } catch (error) {
      console.error("Error saving label:", error);
      res.status(500).json({ error: "Failed to save label" });
    }
  });

  app.delete("/api/admin/labels/:id", async (req: Request, res: Response) => {
    try {
      await db
        .delete(humanLabelsTable)
        .where(eq(humanLabelsTable.id, Number(req.params.id)));
      res.json({ deleted: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete label" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
