import { db } from "../db";
import { jobs, creators, posts, type Job } from "../../shared/schema";
import { eq, sql, and, inArray } from "drizzle-orm";
import { MockAdapter, upsertCreator, savePosts, type PostSourceAdapter } from "./adapter";
import { classifyUnprocessedPosts } from "./classifier";
import { computeAllCreatorFeatures } from "./aggregator";
import { generateRankingSnapshot } from "./scorer";

let activeAdapter: PostSourceAdapter = new MockAdapter();

export function setAdapter(adapter: PostSourceAdapter) {
  activeAdapter = adapter;
}

export function getAdapter(): PostSourceAdapter {
  return activeAdapter;
}

async function runFullRefresh(jobId: number): Promise<void> {
  await updateJob(jobId, "running");
  try {
    const allCreators = await db.select().from(creators).where(eq(creators.isActive, true));
    console.log(`[RankingJob] Processing ${allCreators.length} creators with adapter: ${activeAdapter.name}`);

    let totalPosts = 0;
    for (const creator of allCreators) {
      try {
        const rawPosts = await activeAdapter.fetchPosts(creator.handle);
        if (rawPosts.length > 0) {
          const saved = await savePosts(creator.id, rawPosts);
          totalPosts += saved;
        }
      } catch (err) {
        console.error(`[RankingJob] Error fetching posts for ${creator.handle}:`, err);
      }
    }
    console.log(`[RankingJob] Fetched ${totalPosts} posts`);

    const classified = await classifyUnprocessedPosts();
    console.log(`[RankingJob] Classified ${classified} posts`);

    const featureCount = await computeAllCreatorFeatures(90);
    console.log(`[RankingJob] Computed features for ${featureCount} creators`);

    const { snapshotId, rankedCount } = await generateRankingSnapshot(90, `Job #${jobId} refresh`);
    console.log(`[RankingJob] Generated snapshot #${snapshotId} with ${rankedCount} ranked creators`);

    await updateJob(jobId, "completed");
  } catch (error: any) {
    console.error(`[RankingJob] Job #${jobId} failed:`, error);
    await updateJob(jobId, "failed", error.message);
  }
}

async function runFetchPosts(jobId: number, payload: any): Promise<void> {
  await updateJob(jobId, "running");
  try {
    const creatorIds: number[] = payload?.creatorIds || [];
    const targetCreators = creatorIds.length > 0
      ? await db.select().from(creators).where(inArray(creators.id, creatorIds))
      : await db.select().from(creators).where(eq(creators.isActive, true));

    let totalPosts = 0;
    for (const creator of targetCreators) {
      const rawPosts = await activeAdapter.fetchPosts(creator.handle);
      if (rawPosts.length > 0) {
        const saved = await savePosts(creator.id, rawPosts);
        totalPosts += saved;
      }
    }

    await updateJob(jobId, "completed");
  } catch (error: any) {
    await updateJob(jobId, "failed", error.message);
  }
}

async function runClassify(jobId: number): Promise<void> {
  await updateJob(jobId, "running");
  try {
    const count = await classifyUnprocessedPosts();
    console.log(`[RankingJob] Classified ${count} posts`);
    await updateJob(jobId, "completed");
  } catch (error: any) {
    await updateJob(jobId, "failed", error.message);
  }
}

async function runAggregate(jobId: number): Promise<void> {
  await updateJob(jobId, "running");
  try {
    const count = await computeAllCreatorFeatures(90);
    console.log(`[RankingJob] Computed features for ${count} creators`);
    await updateJob(jobId, "completed");
  } catch (error: any) {
    await updateJob(jobId, "failed", error.message);
  }
}

async function runRanking(jobId: number): Promise<void> {
  await updateJob(jobId, "running");
  try {
    const { snapshotId, rankedCount } = await generateRankingSnapshot(90);
    console.log(`[RankingJob] Generated snapshot #${snapshotId} with ${rankedCount} ranked`);
    await updateJob(jobId, "completed");
  } catch (error: any) {
    await updateJob(jobId, "failed", error.message);
  }
}

async function updateJob(jobId: number, status: string, error?: string) {
  const update: any = { status };
  if (status === "running") update.startedAt = new Date();
  if (status === "completed" || status === "failed") update.finishedAt = new Date();
  if (error) update.error = error;
  await db.update(jobs).set(update).where(eq(jobs.id, jobId));
}

export async function enqueueJob(name: string, payload?: any): Promise<number> {
  const [job] = await db.insert(jobs).values({
    name,
    status: "queued",
    payload: payload || null,
  }).returning();
  return job.id;
}

export async function processNextJob(): Promise<boolean> {
  const [nextJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, "queued"))
    .orderBy(jobs.createdAt)
    .limit(1);

  if (!nextJob) return false;

  switch (nextJob.name) {
    case "full_refresh":
      await runFullRefresh(nextJob.id);
      break;
    case "fetch_posts":
      await runFetchPosts(nextJob.id, nextJob.payload);
      break;
    case "classify":
      await runClassify(nextJob.id);
      break;
    case "aggregate":
      await runAggregate(nextJob.id);
      break;
    case "ranking":
      await runRanking(nextJob.id);
      break;
    default:
      await updateJob(nextJob.id, "failed", `Unknown job type: ${nextJob.name}`);
  }

  return true;
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startJobWorker(pollIntervalMs = 5000) {
  if (workerInterval) return;
  console.log(`[JobWorker] Started polling every ${pollIntervalMs}ms`);
  workerInterval = setInterval(async () => {
    try {
      const processed = await processNextJob();
      if (processed) {
        while (await processNextJob()) {}
      }
    } catch (err) {
      console.error("[JobWorker] Error:", err);
    }
  }, pollIntervalMs);
}

export function stopJobWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[JobWorker] Stopped");
  }
}
