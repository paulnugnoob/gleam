import { db } from "../db";
import {
  creatorFeatures,
  rankingSnapshots,
  rankingEntries,
  creators,
  type ScoreBreakdown,
  type InsertRankingEntry,
} from "../../shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

export interface ScoringWeights {
  formatFit: number;
  consistency: number;
  performance: number;
  repeatability: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  formatFit: 0.35,
  consistency: 0.25,
  performance: 0.25,
  repeatability: 0.15,
};

export const MIN_SAMPLE_POSTS = 5;
export const MIN_GRWM_RATIO = 0.1;

function clamp(val: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, val));
}

export function scoreCreator(
  features: {
    grwmRatio: number;
    tutorialRatio: number;
    makeupRatio: number;
    postsPerWeek: number;
    medianViews: number | null;
    pctPostsOver200kViews: number | null;
    samplePosts: number;
  },
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): { score: number; breakdown: ScoreBreakdown } | null {
  if (features.samplePosts < MIN_SAMPLE_POSTS) return null;
  if (features.grwmRatio < MIN_GRWM_RATIO) return null;

  const formatFit = clamp(
    features.grwmRatio * 0.5 +
      features.tutorialRatio * 0.3 +
      features.makeupRatio * 0.2,
  );

  const consistencyRaw = Math.min(features.postsPerWeek / 3, 1);
  const consistency = clamp(consistencyRaw);

  let performance = 0;
  if (features.medianViews != null) {
    const viewScore = Math.min(features.medianViews / 1000000, 1);
    const viralScore =
      features.pctPostsOver200kViews != null
        ? features.pctPostsOver200kViews
        : 0;
    performance = clamp(viewScore * 0.7 + viralScore * 0.3);
  }

  const sampleConfidence = Math.min(features.samplePosts / 20, 1);
  const repeatability = clamp(
    (sampleConfidence * (features.grwmRatio + features.tutorialRatio)) / 2,
  );

  const score = clamp(
    formatFit * weights.formatFit +
      consistency * weights.consistency +
      performance * weights.performance +
      repeatability * weights.repeatability,
  );

  const breakdown: ScoreBreakdown = {
    formatFit,
    consistency,
    performance,
    repeatability,
    weights,
    rawFeatures: {
      grwmRatio: features.grwmRatio,
      tutorialRatio: features.tutorialRatio,
      makeupRatio: features.makeupRatio,
      postsPerWeek: features.postsPerWeek,
      medianViews: features.medianViews,
      pctPostsOver200kViews: features.pctPostsOver200kViews,
      samplePosts: features.samplePosts,
    },
  };

  return { score, breakdown };
}

export async function generateRankingSnapshot(
  windowDays: number = 90,
  notes?: string,
): Promise<{ snapshotId: number; rankedCount: number }> {
  const features = await db
    .select({
      feature: creatorFeatures,
      creator: creators,
    })
    .from(creatorFeatures)
    .innerJoin(creators, eq(creatorFeatures.creatorId, creators.id))
    .where(
      and(
        eq(creatorFeatures.windowDays, windowDays),
        eq(creators.isActive, true),
      ),
    );

  const scored: {
    creatorId: number;
    score: number;
    breakdown: ScoreBreakdown;
  }[] = [];

  for (const { feature } of features) {
    const result = scoreCreator({
      grwmRatio: feature.grwmRatio,
      tutorialRatio: feature.tutorialRatio,
      makeupRatio: feature.makeupRatio,
      postsPerWeek: feature.postsPerWeek,
      medianViews: feature.medianViews,
      pctPostsOver200kViews: feature.pctPostsOver200kViews,
      samplePosts: feature.samplePosts,
    });
    if (result) {
      scored.push({ creatorId: feature.creatorId, ...result });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top100 = scored.slice(0, 100);

  const today = new Date().toISOString().split("T")[0];
  const [snapshot] = await db
    .insert(rankingSnapshots)
    .values({
      snapshotDate: today,
      windowDays,
      notes: notes || `Auto-generated ranking for ${today}`,
    })
    .returning();

  if (top100.length > 0) {
    const entries: InsertRankingEntry[] = top100.map((s, idx) => ({
      snapshotId: snapshot.id,
      creatorId: s.creatorId,
      rank: idx + 1,
      score: s.score,
      scoreBreakdown: s.breakdown,
    }));
    await db.insert(rankingEntries).values(entries);
  }

  return { snapshotId: snapshot.id, rankedCount: top100.length };
}
