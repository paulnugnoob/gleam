import { db } from "../db";
import { posts, contentSignals, type InsertContentSignal } from "../../shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

const GRWM_KEYWORDS = [
  "grwm", "get ready with me", "getreadywithme", "get ready w me",
  "getting ready", "morning routine makeup", "night out prep",
];

const TUTORIAL_KEYWORDS = [
  "tutorial", "how to", "howto", "step by step", "step-by-step",
  "beginners guide", "beginner guide", "makeup look", "eye look",
  "full glam", "smokey eye", "cut crease", "contour", "baking",
  "makeup routine", "beauty routine", "makeup tips", "beauty tips",
  "makeup hack", "beauty hack",
];

const MAKEUP_KEYWORDS = [
  "makeup", "make up", "foundation", "concealer", "lipstick",
  "lip gloss", "lipgloss", "eyeshadow", "eye shadow", "mascara",
  "eyeliner", "blush", "bronzer", "highlighter", "contour",
  "primer", "setting spray", "setting powder", "beauty blender",
  "brush", "palette", "shade", "swatch", "pigment", "coverage",
  "matte", "dewy", "glam", "beat face", "snatched", "flawless",
  "skincare", "moisturizer", "serum", "sunscreen", "cleanser",
  "toner", "exfoliate", "retinol", "niacinamide", "hyaluronic",
];

function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw));
}

export interface ClassifyResult {
  hasGrwm: boolean;
  hasTutorial: boolean;
  hasMakeup: boolean;
  keywordHits: string[];
  confidence: number;
}

export function classifyCaption(caption: string): ClassifyResult {
  if (!caption) {
    return { hasGrwm: false, hasTutorial: false, hasMakeup: false, keywordHits: [], confidence: 0 };
  }

  const grwmHits = matchKeywords(caption, GRWM_KEYWORDS);
  const tutorialHits = matchKeywords(caption, TUTORIAL_KEYWORDS);
  const makeupHits = matchKeywords(caption, MAKEUP_KEYWORDS);

  const hasGrwm = grwmHits.length > 0;
  const hasTutorial = tutorialHits.length > 0;
  const hasMakeup = makeupHits.length > 0;

  const allHits = [...grwmHits, ...tutorialHits, ...makeupHits];

  let confidence = 0;
  if (hasGrwm) confidence += 0.4;
  if (hasTutorial) confidence += 0.3;
  if (hasMakeup) confidence += 0.2;
  if (allHits.length > 3) confidence += 0.1;
  confidence = Math.min(confidence, 1.0);

  return { hasGrwm, hasTutorial, hasMakeup, keywordHits: allHits, confidence };
}

export async function classifyUnprocessedPosts(creatorId?: number): Promise<number> {
  const query = db
    .select({ post: posts })
    .from(posts)
    .leftJoin(contentSignals, eq(posts.id, contentSignals.postId))
    .where(isNull(contentSignals.id));

  const unprocessed = creatorId
    ? await query.where(eq(posts.creatorId, creatorId))
    : await query;

  let count = 0;
  for (const { post } of unprocessed) {
    const result = classifyCaption(post.caption || "");
    await db.insert(contentSignals).values({
      postId: post.id,
      hasGrwm: result.hasGrwm,
      hasTutorial: result.hasTutorial,
      hasMakeup: result.hasMakeup,
      keywordHits: result.keywordHits,
      confidence: result.confidence,
    });
    count++;
  }
  return count;
}
