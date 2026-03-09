import { db } from "../db";
import {
  creators,
  posts,
  type InsertCreator,
  type InsertPost,
} from "../../shared/schema";
import { eq } from "drizzle-orm";

export interface RawPost {
  platformPostId?: string;
  postUrl?: string;
  caption?: string;
  postedAt?: Date | string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  rawJson?: any;
}

export interface PostSourceAdapter {
  name: string;
  fetchPosts(creatorHandle: string): Promise<RawPost[]>;
}

export class MockAdapter implements PostSourceAdapter {
  name = "mock";

  async fetchPosts(creatorHandle: string): Promise<RawPost[]> {
    const templates = [
      {
        caption: "grwm for work today!! #grwm #makeup #beauty",
        views: 450000,
        likes: 32000,
      },
      {
        caption:
          "full glam makeup tutorial using only drugstore products #makeuptutorial #beauty",
        views: 890000,
        likes: 67000,
      },
      {
        caption: "get ready with me brunch edition #grwm #getreadywithme",
        views: 320000,
        likes: 24000,
      },
      {
        caption: "day in my life vlog #ditl #lifestyle",
        views: 150000,
        likes: 11000,
      },
      {
        caption: "trying viral concealer hack #makeup #beautytips #tutorial",
        views: 1200000,
        likes: 95000,
      },
      {
        caption: "skincare routine morning edition #skincare #beauty",
        views: 280000,
        likes: 19000,
      },
      {
        caption: "get ready with me date night #grwm #makeuplook",
        views: 560000,
        likes: 42000,
      },
      {
        caption: "outfit of the day #ootd #fashion",
        views: 200000,
        likes: 15000,
      },
      {
        caption: "step by step smokey eye tutorial #makeuptutorial #eyemakeup",
        views: 780000,
        likes: 58000,
      },
      {
        caption: "what i eat in a day #food #healthy",
        views: 180000,
        likes: 13000,
      },
      {
        caption: "grwm concert edition full glam #grwm #makeup #concert",
        views: 620000,
        likes: 47000,
      },
      {
        caption: "everyday makeup routine 5 min #quickmakeup #beauty #tutorial",
        views: 950000,
        likes: 71000,
      },
    ];

    const numPosts = 8 + Math.floor(Math.random() * 5);
    const result: RawPost[] = [];
    const now = Date.now();

    for (let i = 0; i < numPosts; i++) {
      const template = templates[Math.floor(Math.random() * templates.length)];
      const daysAgo = Math.floor(Math.random() * 90);
      const jitter = 0.5 + Math.random();

      result.push({
        platformPostId: `mock_${creatorHandle}_${i}`,
        caption: template.caption,
        postedAt: new Date(now - daysAgo * 86400000),
        views: Math.round(template.views * jitter),
        likes: Math.round(template.likes * jitter),
        comments: Math.round(template.likes * jitter * 0.05),
        shares: Math.round(template.likes * jitter * 0.02),
      });
    }
    return result;
  }
}

export interface CSVRow {
  handle: string;
  displayName?: string;
  platform?: string;
  profileUrl?: string;
  avatarUrl?: string;
  posts?: CSVPostRow[];
}

export interface CSVPostRow {
  platformPostId?: string;
  postUrl?: string;
  caption?: string;
  postedAt?: string;
  views?: string | number;
  likes?: string | number;
  comments?: string | number;
  shares?: string | number;
}

export class CSVPostsAdapter implements PostSourceAdapter {
  name = "csv";
  private postsByHandle: Map<string, RawPost[]> = new Map();

  loadFromRows(rows: CSVPostRow[], handle: string) {
    const parsed: RawPost[] = rows.map((r) => ({
      platformPostId: r.platformPostId,
      postUrl: r.postUrl,
      caption: r.caption,
      postedAt: r.postedAt ? new Date(r.postedAt) : undefined,
      views:
        typeof r.views === "string"
          ? parseInt(r.views, 10) || undefined
          : r.views,
      likes:
        typeof r.likes === "string"
          ? parseInt(r.likes, 10) || undefined
          : r.likes,
      comments:
        typeof r.comments === "string"
          ? parseInt(r.comments, 10) || undefined
          : r.comments,
      shares:
        typeof r.shares === "string"
          ? parseInt(r.shares, 10) || undefined
          : r.shares,
    }));
    this.postsByHandle.set(handle, parsed);
  }

  async fetchPosts(creatorHandle: string): Promise<RawPost[]> {
    return this.postsByHandle.get(creatorHandle) || [];
  }
}

export async function upsertCreator(data: {
  handle: string;
  displayName?: string;
  platform?: string;
  profileUrl?: string;
  avatarUrl?: string;
  source?: string;
}): Promise<number> {
  const existing = await db
    .select()
    .from(creators)
    .where(eq(creators.handle, data.handle))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(creators)
      .set({
        displayName: data.displayName || existing[0].displayName,
        profileUrl: data.profileUrl || existing[0].profileUrl,
        avatarUrl: data.avatarUrl || existing[0].avatarUrl,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creators.id, existing[0].id));
    return existing[0].id;
  }
  const [created] = await db
    .insert(creators)
    .values({
      handle: data.handle,
      displayName: data.displayName || data.handle,
      platform: data.platform || "tiktok",
      profileUrl: data.profileUrl,
      avatarUrl: data.avatarUrl,
      source: data.source || "manual",
    })
    .returning();
  return created.id;
}

export async function savePosts(
  creatorId: number,
  rawPosts: RawPost[],
): Promise<number> {
  if (rawPosts.length === 0) return 0;
  const values: InsertPost[] = rawPosts.map((p) => ({
    creatorId,
    platformPostId: p.platformPostId || null,
    postUrl: p.postUrl || null,
    caption: p.caption || null,
    postedAt: p.postedAt ? new Date(p.postedAt as any) : null,
    views: p.views ?? null,
    likes: p.likes ?? null,
    comments: p.comments ?? null,
    shares: p.shares ?? null,
    rawJson: p.rawJson || null,
  }));
  await db.insert(posts).values(values);
  return values.length;
}
