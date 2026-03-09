import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as fs from "node:fs";
import { eq, desc, and, sql } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { gemini as ai } from "./gemini";
import {
  analyzeVideo,
  buildConsumerAnalysisResponse,
} from "./analysis/videoAnalysisService";
import type { SkinToneData, DebugData } from "@shared/schema";
import {
  creators as creatorsTable,
  posts as postsTable,
  creatorFeatures as creatorFeaturesTable,
  rankingSnapshots as rankingSnapshotsTable,
  rankingEntries as rankingEntriesTable,
  jobs as jobsTable,
  humanLabels as humanLabelsTable,
  userFeedback,
} from "../shared/schema";
import { upsertCreator, savePosts, CSVPostsAdapter } from "./ranking/adapter";
import { enqueueJob } from "./ranking/jobRunner";

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
      res.json(
        buildConsumerAnalysisResponse(
          analysis,
          products,
          analysis.tutorialSteps || [],
        ),
      );
    } catch (error) {
      console.error("Error fetching video analysis:", error);
      res.status(500).json({ error: "Failed to fetch video analysis" });
    }
  });

  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { videoAnalysisId, detectedProductId, feedbackType, note } = req.body;

      if (!videoAnalysisId || !feedbackType) {
        return res
          .status(400)
          .json({ error: "videoAnalysisId and feedbackType are required" });
      }

      const feedback = await storage.createUserFeedback({
        videoAnalysisId,
        detectedProductId: detectedProductId || null,
        feedbackType,
        note: note || null,
        status: "new",
      });

      res.status(201).json(feedback);
    } catch (error) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ error: "Failed to create feedback" });
    }
  });

  app.put("/api/admin/feedback/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ error: "status is required" });
      }

      const [updated] = await db
        .update(userFeedback)
        .set({ status, updatedAt: new Date() })
        .where(eq(userFeedback.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating feedback:", error);
      res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  app.put(
    "/api/admin/products/:id/review",
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { reviewStatus, adminNote } = req.body;

        if (!reviewStatus) {
          return res.status(400).json({ error: "reviewStatus is required" });
        }

        const updated = await storage.updateDetectedProduct(id, {
          reviewStatus,
          adminNote: adminNote || null,
        });

        if (!updated) {
          return res.status(404).json({ error: "Product not found" });
        }

        res.json(updated);
      } catch (error) {
        console.error("Error reviewing product:", error);
        res.status(500).json({ error: "Failed to review product" });
      }
    },
  );

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
      const mode = extractionMode === "fixed_fps" ? "fixed_fps" : "scene_change";

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

      const result = await analyzeVideo({
        videoUrl,
        extractionMode: mode,
      });

      res.json(result);
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
      const feedback = await storage.getRecentFeedback();
      const result = await Promise.all(
        analyses.map(async (a) => {
          const products =
            a.status === "completed"
              ? await storage.getDetectedProducts(a.id)
              : [];
          const analysisFeedback = feedback.filter((f) => f.videoAnalysisId === a.id);
          const consumer = buildConsumerAnalysisResponse(
            a,
            products,
            a.tutorialSteps || [],
          );
          const needsReviewCount = products.filter(
            (p) => p.reviewStatus === "needs_review" || p.reviewStatus === "rejected",
          ).length;
          const unresolvedFeedbackCount = analysisFeedback.filter(
            (f) => f.status !== "resolved",
          ).length;

          return {
            id: a.id,
            videoUrl: a.videoUrl,
            platform: a.platform,
            thumbnailUrl: a.thumbnailUrl,
            title: a.title,
            status: a.status,
            stepCount: a.tutorialSteps?.length || 0,
            productCount: a.productCount,
            matchedProductCount: a.matchedProductCount,
            exactCount: consumer.confidenceSummary.exactCount,
            candidateCount: consumer.confidenceSummary.candidateCount,
            processingTimeMs:
              (a.debugData as any)?.timingReport?.totalDurationMs || null,
            extractionMode: (a.debugData as any)?.extractionMode || null,
            frameCount: (a.debugData as any)?.frameCount || 0,
            feedbackCount: analysisFeedback.length,
            unresolvedFeedbackCount,
            needsReviewCount,
            hasFeedback: analysisFeedback.length > 0,
            hasCandidates: consumer.confidenceSummary.candidateCount > 0,
            needsReview:
              unresolvedFeedbackCount > 0 ||
              consumer.confidenceSummary.candidateCount > 0 ||
              needsReviewCount > 0,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          };
        }),
      );
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
      const feedback = await storage.getFeedbackForAnalysis(id);

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
          reviewStatus: p.reviewStatus,
          adminNote: p.adminNote,
        })),
        feedback,
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
    try {
      processingQueue.set(videoUrl, { status: "queued" });
      await analyzeVideo({
        videoUrl,
        extractionMode: "scene_change",
        onStatusChange: async (status, context) => {
          processingQueue.set(videoUrl, {
            status,
            analysisId: context.analysisId,
            error: context.error,
          });
        },
      });
    } catch (error: any) {
      console.error(`Background processing error for ${videoUrl}:`, error);
      const existing = await storage.getVideoAnalysisByUrl(videoUrl);
      processingQueue.set(videoUrl, {
        status: "failed",
        analysisId: existing?.id,
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
