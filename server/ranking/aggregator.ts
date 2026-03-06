import { db } from "../db";
import { posts, contentSignals, creatorFeatures, creators, type InsertCreatorFeature } from "../../shared/schema";
import { eq, gte, and, sql, desc } from "drizzle-orm";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function aggregateCreatorFeatures(
  creatorId: number,
  windowDays: number = 90
): Promise<InsertCreatorFeature | null> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const creatorPosts = await db
    .select({
      postId: posts.id,
      postedAt: posts.postedAt,
      views: posts.views,
      hasGrwm: contentSignals.hasGrwm,
      hasTutorial: contentSignals.hasTutorial,
      hasMakeup: contentSignals.hasMakeup,
    })
    .from(posts)
    .leftJoin(contentSignals, eq(posts.id, contentSignals.postId))
    .where(
      and(
        eq(posts.creatorId, creatorId),
        gte(posts.postedAt, windowStart)
      )
    )
    .orderBy(desc(posts.postedAt));

  const samplePosts = creatorPosts.length;
  if (samplePosts === 0) return null;

  let grwmCount = 0;
  let tutorialCount = 0;
  let makeupCount = 0;
  const viewValues: number[] = [];
  let over200k = 0;
  let lastPostAt: Date | null = null;

  for (const p of creatorPosts) {
    if (p.hasGrwm) grwmCount++;
    if (p.hasTutorial) tutorialCount++;
    if (p.hasMakeup) makeupCount++;
    if (p.views != null) {
      viewValues.push(p.views);
      if (p.views >= 200000) over200k++;
    }
    if (p.postedAt && (!lastPostAt || p.postedAt > lastPostAt)) {
      lastPostAt = p.postedAt;
    }
  }

  const weeks = windowDays / 7;
  const postsPerWeek = samplePosts / weeks;

  const feature: InsertCreatorFeature = {
    creatorId,
    windowDays,
    samplePosts,
    grwmRatio: grwmCount / samplePosts,
    tutorialRatio: tutorialCount / samplePosts,
    makeupRatio: makeupCount / samplePosts,
    postsPerWeek,
    medianViews: median(viewValues),
    pctPostsOver200kViews: viewValues.length > 0 ? over200k / viewValues.length : null,
    lastPostAt,
    computedAt: new Date(),
  };

  return feature;
}

export async function computeAndStoreFeatures(creatorId: number, windowDays: number = 90): Promise<boolean> {
  const feature = await aggregateCreatorFeatures(creatorId, windowDays);
  if (!feature) return false;

  await db.delete(creatorFeatures).where(
    and(
      eq(creatorFeatures.creatorId, creatorId),
      eq(creatorFeatures.windowDays, windowDays)
    )
  );

  await db.insert(creatorFeatures).values(feature);
  return true;
}

export async function computeAllCreatorFeatures(windowDays: number = 90): Promise<number> {
  const allCreators = await db.select({ id: creators.id }).from(creators).where(eq(creators.isActive, true));
  let computed = 0;
  for (const c of allCreators) {
    const ok = await computeAndStoreFeatures(c.id, windowDays);
    if (ok) computed++;
  }
  return computed;
}
