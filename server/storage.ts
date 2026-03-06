import {
  type User,
  type InsertUser,
  type VideoAnalysis,
  type InsertVideoAnalysis,
  type DetectedProduct,
  type InsertDetectedProduct,
  type SavedLook,
  type InsertSavedLook,
  type UserProfile,
  type InsertUserProfile,
  users,
  videoAnalyses,
  detectedProducts,
  savedLooks,
  userProfiles,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, count } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getVideoAnalysis(id: number): Promise<VideoAnalysis | undefined>;
  getVideoAnalysisByUrl(url: string): Promise<VideoAnalysis | undefined>;
  getAllVideoAnalyses(): Promise<VideoAnalysis[]>;
  getVideoAnalysesWithProductCounts(): Promise<(VideoAnalysis & { productCount: number; matchedProductCount: number })[]>;
  createVideoAnalysis(analysis: InsertVideoAnalysis): Promise<VideoAnalysis>;
  updateVideoAnalysis(id: number, analysis: Partial<InsertVideoAnalysis>): Promise<VideoAnalysis | undefined>;

  getDetectedProducts(videoAnalysisId: number): Promise<DetectedProduct[]>;
  createDetectedProduct(product: InsertDetectedProduct): Promise<DetectedProduct>;
  updateDetectedProduct(id: number, product: Partial<InsertDetectedProduct>): Promise<DetectedProduct | undefined>;

  getSavedLook(id: number): Promise<SavedLook | undefined>;
  getAllSavedLooks(): Promise<(SavedLook & { videoAnalysis?: VideoAnalysis; productCount?: number })[]>;
  createSavedLook(look: InsertSavedLook): Promise<SavedLook>;
  deleteSavedLook(id: number): Promise<void>;

  getUserProfile(): Promise<UserProfile | undefined>;
  createOrUpdateUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getVideoAnalysis(id: number): Promise<VideoAnalysis | undefined> {
    const [analysis] = await db.select().from(videoAnalyses).where(eq(videoAnalyses.id, id));
    return analysis || undefined;
  }

  async getVideoAnalysisByUrl(url: string): Promise<VideoAnalysis | undefined> {
    const [analysis] = await db.select().from(videoAnalyses).where(eq(videoAnalyses.videoUrl, url));
    return analysis || undefined;
  }

  async getAllVideoAnalyses(): Promise<VideoAnalysis[]> {
    return db.select().from(videoAnalyses).orderBy(desc(videoAnalyses.createdAt));
  }

  async getVideoAnalysesWithProductCounts(): Promise<(VideoAnalysis & { productCount: number; matchedProductCount: number })[]> {
    const analyses = await db.select().from(videoAnalyses).orderBy(desc(videoAnalyses.createdAt));
    
    const result = await Promise.all(
      analyses.map(async (analysis) => {
        const products = await db.select().from(detectedProducts).where(eq(detectedProducts.videoAnalysisId, analysis.id));
        const matchedCount = products.filter(p => p.matchedProductName).length;
        return {
          ...analysis,
          productCount: products.length,
          matchedProductCount: matchedCount,
        };
      })
    );
    
    return result;
  }

  async createVideoAnalysis(analysis: InsertVideoAnalysis): Promise<VideoAnalysis> {
    const [created] = await db.insert(videoAnalyses).values(analysis).returning();
    return created;
  }

  async updateVideoAnalysis(id: number, analysis: Partial<InsertVideoAnalysis>): Promise<VideoAnalysis | undefined> {
    const [updated] = await db
      .update(videoAnalyses)
      .set({ ...analysis, updatedAt: new Date() })
      .where(eq(videoAnalyses.id, id))
      .returning();
    return updated || undefined;
  }

  async getDetectedProducts(videoAnalysisId: number): Promise<DetectedProduct[]> {
    return db.select().from(detectedProducts).where(eq(detectedProducts.videoAnalysisId, videoAnalysisId));
  }

  async createDetectedProduct(product: InsertDetectedProduct): Promise<DetectedProduct> {
    const [created] = await db.insert(detectedProducts).values(product).returning();
    return created;
  }

  async updateDetectedProduct(id: number, product: Partial<InsertDetectedProduct>): Promise<DetectedProduct | undefined> {
    const [updated] = await db
      .update(detectedProducts)
      .set(product)
      .where(eq(detectedProducts.id, id))
      .returning();
    return updated || undefined;
  }

  async getSavedLook(id: number): Promise<SavedLook | undefined> {
    const [look] = await db.select().from(savedLooks).where(eq(savedLooks.id, id));
    return look || undefined;
  }

  async getAllSavedLooks(): Promise<(SavedLook & { videoAnalysis?: VideoAnalysis; productCount?: number })[]> {
    const looks = await db.select().from(savedLooks).orderBy(desc(savedLooks.createdAt));

    const result = await Promise.all(
      looks.map(async (look) => {
        const [analysis] = await db.select().from(videoAnalyses).where(eq(videoAnalyses.id, look.videoAnalysisId));
        const products = await db.select().from(detectedProducts).where(eq(detectedProducts.videoAnalysisId, look.videoAnalysisId));
        return {
          ...look,
          videoAnalysis: analysis,
          productCount: products.length,
        };
      })
    );

    return result;
  }

  async createSavedLook(look: InsertSavedLook): Promise<SavedLook> {
    const [created] = await db.insert(savedLooks).values(look).returning();
    return created;
  }

  async deleteSavedLook(id: number): Promise<void> {
    await db.delete(savedLooks).where(eq(savedLooks.id, id));
  }

  async getUserProfile(): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).limit(1);
    return profile || undefined;
  }

  async createOrUpdateUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const existing = await this.getUserProfile();
    if (existing) {
      const [updated] = await db
        .update(userProfiles)
        .set({ ...profile, updatedAt: new Date() })
        .where(eq(userProfiles.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userProfiles).values(profile).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
