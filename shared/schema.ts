import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
  real,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/chat";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export interface TimingReport {
  analysisId?: number;
  videoUrl?: string;
  extractionMode: "fixed_fps" | "scene_change";
  stages: Array<{
    stage: string;
    startTime: number;
    endTime?: number;
    durationMs?: number;
  }>;
  totalDurationMs: number;
  frameCount: number;
  videoDurationSec: number;
  summary: {
    download: number;
    frameExtraction: number;
    audioExtraction: number;
    aiAnalysis: number;
    productMatching: number;
    dbOperations: number;
  };
}

export interface DebugData {
  frames: string[];
  metadata: {
    title: string;
    description: string;
    duration: number;
    uploader: string;
    uploadDate: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    thumbnailUrl: string;
    platform: string;
    originalUrl: string;
  };
  audioTranscript: string | null;
  aiPrompt: string;
  aiResponse: string;
  frameCount: number;
  processingTimeMs: number;
  extractionMode?: "fixed_fps" | "scene_change";
  sceneTimestamps?: number[];
  timingReport?: TimingReport;
}

export const videoAnalyses = pgTable("video_analyses", {
  id: serial("id").primaryKey(),
  videoUrl: text("video_url").notNull(),
  platform: text("platform"),
  thumbnailUrl: text("thumbnail_url"),
  title: text("title"),
  status: text("status").notNull().default("pending"),
  tutorialSteps: jsonb("tutorial_steps").$type<TutorialStep[]>(),
  debugData: jsonb("debug_data").$type<DebugData>(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const videoAnalysesRelations = relations(videoAnalyses, ({ many }) => ({
  products: many(detectedProducts),
}));

export const detectedProducts = pgTable("detected_products", {
  id: serial("id").primaryKey(),
  videoAnalysisId: integer("video_analysis_id")
    .notNull()
    .references(() => videoAnalyses.id, { onDelete: "cascade" }),
  aiDetectedName: text("ai_detected_name").notNull(),
  aiDetectedBrand: text("ai_detected_brand"),
  aiDetectedType: text("ai_detected_type"),
  aiDetectedColor: text("ai_detected_color"),
  aiDetectedDescription: text("ai_detected_description"),
  aiConfidence: text("ai_confidence"),
  aiEvidence: jsonb("ai_evidence").$type<ProductEvidence>(),
  normalizedBrandSlug: text("normalized_brand_slug"),
  normalizedCategoryKey: text("normalized_category_key"),
  normalizedNameTokens: jsonb("normalized_name_tokens").$type<string[]>(),
  matchedProductId: integer("matched_product_id"),
  matchedProductSource: text("matched_product_source"),
  matchedProductSourceId: text("matched_product_source_id"),
  matchedProductMarketplace: text("matched_product_marketplace"),
  matchedProductName: text("matched_product_name"),
  matchedProductBrand: text("matched_product_brand"),
  matchedProductImage: text("matched_product_image"),
  matchedProductPrice: text("matched_product_price"),
  matchedProductType: text("matched_product_type"),
  matchedProductUrl: text("matched_product_url"),
  matchedProductDescription: text("matched_product_description"),
  matchedProductColors: jsonb("matched_product_colors").$type<ProductColor[]>(),
  matchedProductAlternatives: jsonb("matched_product_alternatives").$type<
    CatalogAlternative[]
  >(),
  matchScore: jsonb("match_score").$type<MatchScore>(),
  reviewStatus: text("review_status").default("unreviewed"),
  adminNote: text("admin_note"),
  recommendedShade: text("recommended_shade"),
  timestamp: text("timestamp"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const detectedProductsRelations = relations(
  detectedProducts,
  ({ one }) => ({
    videoAnalysis: one(videoAnalyses, {
      fields: [detectedProducts.videoAnalysisId],
      references: [videoAnalyses.id],
    }),
  }),
);

export const savedLooks = pgTable("saved_looks", {
  id: serial("id").primaryKey(),
  videoAnalysisId: integer("video_analysis_id")
    .notNull()
    .references(() => videoAnalyses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const savedLooksRelations = relations(savedLooks, ({ one }) => ({
  videoAnalysis: one(videoAnalyses, {
    fields: [savedLooks.videoAnalysisId],
    references: [videoAnalyses.id],
  }),
}));

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").default("Beauty Enthusiast"),
  avatarUrl: text("avatar_url"),
  skinToneData: jsonb("skin_tone_data").$type<SkinToneData>(),
  selfieUrls: jsonb("selfie_urls").$type<string[]>(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const insertVideoAnalysisSchema = createInsertSchema(videoAnalyses).omit(
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  },
);

export const insertDetectedProductSchema = createInsertSchema(
  detectedProducts,
).omit({
  id: true,
  createdAt: true,
});

export const insertSavedLookSchema = createInsertSchema(savedLooks).omit({
  id: true,
  createdAt: true,
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VideoAnalysis = typeof videoAnalyses.$inferSelect;
export type InsertVideoAnalysis = z.infer<typeof insertVideoAnalysisSchema>;
export type DetectedProduct = typeof detectedProducts.$inferSelect;
export type InsertDetectedProduct = z.infer<typeof insertDetectedProductSchema>;
export type SavedLook = typeof savedLooks.$inferSelect;
export type InsertSavedLook = z.infer<typeof insertSavedLookSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export interface TutorialStep {
  stepNumber: number;
  instruction: string;
  timestamp?: string;
  productUsed?: string;
}

export interface ProductColor {
  hex_value: string;
  colour_name: string;
}

export interface SkinToneData {
  hexColor: string;
  undertone: "warm" | "cool" | "neutral";
  depth: "fair" | "light" | "medium" | "tan" | "deep";
}

export interface ProductEvidence {
  visual: string | null;
  audio: string | null;
  metadata: string | null;
}

export interface NormalizedProduct {
  brandSlug: string | null;
  nameTokens: string[];
  categoryKey: string;
}

export interface MatchScore {
  overall: number;
  brandMatch: number;
  typeMatch: number;
  nameMatch: number;
}

export interface CatalogAlternative {
  source: string;
  sourceId: string;
  marketplace: string | null;
  name: string;
  brand: string | null;
  price: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  description: string | null;
  productType: string | null;
  score: MatchScore | null;
}

export type ProductConfidenceBucket = "exact" | "candidate" | "hidden";

export interface PresentedProduct extends DetectedProduct {
  confidenceBucket: ProductConfidenceBucket;
  confidenceScore: number;
  confidenceLabel: string;
}

export interface ConfidenceSummary {
  exactCount: number;
  candidateCount: number;
  hiddenCount: number;
}

export interface ConsumerAnalysisResponse {
  analysis: VideoAnalysis | undefined;
  products: PresentedProduct[];
  productsExact: PresentedProduct[];
  productsCandidates: PresentedProduct[];
  tutorialSteps: TutorialStep[];
  confidenceSummary: ConfidenceSummary;
  warning?: string;
}

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  videoAnalysisId: integer("video_analysis_id")
    .notNull()
    .references(() => videoAnalyses.id, { onDelete: "cascade" }),
  detectedProductId: integer("detected_product_id").references(
    () => detectedProducts.id,
    { onDelete: "set null" },
  ),
  feedbackType: text("feedback_type").notNull(),
  note: text("note"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const userFeedbackRelations = relations(userFeedback, ({ one }) => ({
  videoAnalysis: one(videoAnalyses, {
    fields: [userFeedback.videoAnalysisId],
    references: [videoAnalyses.id],
  }),
  detectedProduct: one(detectedProducts, {
    fields: [userFeedback.detectedProductId],
    references: [detectedProducts.id],
  }),
}));

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserFeedback = typeof userFeedback.$inferSelect;
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;

// ========== CREATOR RANKING TABLES ==========

export const creators = pgTable("creators", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull().default("tiktok"),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name"),
  profileUrl: text("profile_url"),
  avatarUrl: text("avatar_url"),
  source: text("source").notNull().default("manual"),
  isActive: boolean("is_active").notNull().default(true),
  firstSeenAt: timestamp("first_seen_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  lastSeenAt: timestamp("last_seen_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => creators.id, { onDelete: "cascade" }),
  platformPostId: text("platform_post_id"),
  postUrl: text("post_url"),
  caption: text("caption"),
  postedAt: timestamp("posted_at"),
  views: integer("views"),
  likes: integer("likes"),
  comments: integer("comments"),
  shares: integer("shares"),
  rawJson: jsonb("raw_json"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const contentSignals = pgTable("content_signals", {
  id: serial("id").primaryKey(),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  hasGrwm: boolean("has_grwm").notNull().default(false),
  hasTutorial: boolean("has_tutorial").notNull().default(false),
  hasMakeup: boolean("has_makeup").notNull().default(false),
  keywordHits: jsonb("keyword_hits").$type<string[]>(),
  confidence: real("confidence").notNull().default(0),
  transcriptExcerpt: text("transcript_excerpt"),
  onscreenTextExcerpt: text("onscreen_text_excerpt"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const creatorFeatures = pgTable("creator_features", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => creators.id, { onDelete: "cascade" }),
  windowDays: integer("window_days").notNull().default(90),
  samplePosts: integer("sample_posts").notNull().default(0),
  grwmRatio: real("grwm_ratio").notNull().default(0),
  tutorialRatio: real("tutorial_ratio").notNull().default(0),
  makeupRatio: real("makeup_ratio").notNull().default(0),
  postsPerWeek: real("posts_per_week").notNull().default(0),
  medianViews: real("median_views"),
  pctPostsOver200kViews: real("pct_posts_over_200k_views"),
  lastPostAt: timestamp("last_post_at"),
  computedAt: timestamp("computed_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const rankingSnapshots = pgTable("ranking_snapshots", {
  id: serial("id").primaryKey(),
  snapshotDate: date("snapshot_date").notNull(),
  windowDays: integer("window_days").notNull().default(90),
  notes: text("notes"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const rankingEntries = pgTable("ranking_entries", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => rankingSnapshots.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => creators.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  score: real("score").notNull(),
  scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("queued"),
  payload: jsonb("payload"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  error: text("error"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Relations
export const creatorsRelations = relations(creators, ({ many }) => ({
  posts: many(posts),
  features: many(creatorFeatures),
  rankingEntries: many(rankingEntries),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  creator: one(creators, {
    fields: [posts.creatorId],
    references: [creators.id],
  }),
  signals: many(contentSignals),
}));

export const contentSignalsRelations = relations(contentSignals, ({ one }) => ({
  post: one(posts, { fields: [contentSignals.postId], references: [posts.id] }),
}));

export const creatorFeaturesRelations = relations(
  creatorFeatures,
  ({ one }) => ({
    creator: one(creators, {
      fields: [creatorFeatures.creatorId],
      references: [creators.id],
    }),
  }),
);

export const rankingSnapshotsRelations = relations(
  rankingSnapshots,
  ({ many }) => ({
    entries: many(rankingEntries),
  }),
);

export const rankingEntriesRelations = relations(rankingEntries, ({ one }) => ({
  snapshot: one(rankingSnapshots, {
    fields: [rankingEntries.snapshotId],
    references: [rankingSnapshots.id],
  }),
  creator: one(creators, {
    fields: [rankingEntries.creatorId],
    references: [creators.id],
  }),
}));

export const humanLabels = pgTable("human_labels", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => rankingSnapshots.id, { onDelete: "cascade" }),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => creators.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  note: text("note"),
  labeledBy: text("labeled_by").default("admin"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const humanLabelsRelations = relations(humanLabels, ({ one }) => ({
  snapshot: one(rankingSnapshots, {
    fields: [humanLabels.snapshotId],
    references: [rankingSnapshots.id],
  }),
  creator: one(creators, {
    fields: [humanLabels.creatorId],
    references: [creators.id],
  }),
}));

// Insert schemas
export const insertHumanLabelSchema = createInsertSchema(humanLabels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCreatorSchema = createInsertSchema(creators).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPostSchema = createInsertSchema(posts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertContentSignalSchema = createInsertSchema(
  contentSignals,
).omit({ id: true, createdAt: true });
export const insertCreatorFeatureSchema = createInsertSchema(
  creatorFeatures,
).omit({ id: true });
export const insertRankingSnapshotSchema = createInsertSchema(
  rankingSnapshots,
).omit({ id: true, createdAt: true });
export const insertRankingEntrySchema = createInsertSchema(rankingEntries).omit(
  { id: true, createdAt: true },
);
export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
});

// Types
export type Creator = typeof creators.$inferSelect;
export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type ContentSignal = typeof contentSignals.$inferSelect;
export type InsertContentSignal = z.infer<typeof insertContentSignalSchema>;
export type CreatorFeature = typeof creatorFeatures.$inferSelect;
export type InsertCreatorFeature = z.infer<typeof insertCreatorFeatureSchema>;
export type RankingSnapshot = typeof rankingSnapshots.$inferSelect;
export type InsertRankingSnapshot = z.infer<typeof insertRankingSnapshotSchema>;
export type RankingEntry = typeof rankingEntries.$inferSelect;
export type InsertRankingEntry = z.infer<typeof insertRankingEntrySchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type HumanLabel = typeof humanLabels.$inferSelect;
export type InsertHumanLabel = z.infer<typeof insertHumanLabelSchema>;

export interface ScoreBreakdown {
  formatFit: number;
  consistency: number;
  performance: number;
  repeatability: number;
  weights: {
    formatFit: number;
    consistency: number;
    performance: number;
    repeatability: number;
  };
  rawFeatures: {
    grwmRatio: number;
    tutorialRatio: number;
    makeupRatio: number;
    postsPerWeek: number;
    medianViews: number | null;
    pctPostsOver200kViews: number | null;
    samplePosts: number;
  };
}
