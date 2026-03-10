import { gemini } from "./gemini";

type AnalysisProvider = "gemini" | "openai";

interface ImageInput {
  mimeType: string;
  data: string;
}

interface CompletionResult {
  text: string;
  raw: unknown;
}

const DEFAULT_PROVIDER: AnalysisProvider = "gemini";

function parseJsonFromText<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      return null;
    }
  }
}

function getProvider(provider?: string): AnalysisProvider {
  return provider === "openai" ? "openai" : DEFAULT_PROVIDER;
}

function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. OpenAI-backed analysis cannot run until it is configured.",
    );
  }
  return apiKey;
}

async function runGeminiCompletion(
  prompt: string,
  images: ImageInput[] = [],
): Promise<CompletionResult> {
  const parts: Array<
    | { text: string }
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
  > = [{ text: prompt }, ...images.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    }))];

  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_ANALYSIS_MODEL || "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
  });

  return {
    text: response.text || "",
    raw: response,
  };
}

async function runOpenAiCompletion(
  prompt: string,
  images: ImageInput[] = [],
): Promise<CompletionResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAiApiKey()}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            ...images.map((image) => ({
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.data}`,
              },
            })),
          ],
        },
      ],
    }),
  });

  const raw = await response.json();
  if (!response.ok) {
    throw new Error(
      `OpenAI completion failed: ${response.status} ${JSON.stringify(raw)}`,
    );
  }

  const choice = raw?.choices?.[0]?.message?.content;
  const text =
    typeof choice === "string"
      ? choice
      : Array.isArray(choice)
        ? choice
            .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
            .join("\n")
        : "";

  return { text, raw };
}

export async function runJsonCompletion<T>({
  prompt,
  images = [],
  provider = process.env.ANALYSIS_AI_PROVIDER,
}: {
  prompt: string;
  images?: ImageInput[];
  provider?: string;
}): Promise<{ parsed: T | null; text: string; raw: unknown; provider: AnalysisProvider }> {
  const selected = getProvider(provider);
  const result =
    selected === "openai"
      ? await runOpenAiCompletion(prompt, images)
      : await runGeminiCompletion(prompt, images);

  return {
    parsed: parseJsonFromText<T>(result.text),
    text: result.text,
    raw: result.raw,
    provider: selected,
  };
}

export async function transcribeAudio({
  mimeType,
  data,
  provider = process.env.ANALYSIS_AI_PROVIDER,
}: {
  mimeType: string;
  data: string;
  provider?: string;
}): Promise<string | null> {
  const selected = getProvider(provider);

  if (selected === "openai") {
    const form = new FormData();
    const bytes = Buffer.from(data, "base64");
    const blob = new Blob([bytes], { type: mimeType });
    form.append("file", blob, `audio.${mimeType.split("/")[1] || "bin"}`);
    form.append(
      "model",
      process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",
    );

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAiApiKey()}`,
      },
      body: form,
    });

    const raw = await response.json();
    if (!response.ok) {
      throw new Error(
        `OpenAI transcription failed: ${response.status} ${JSON.stringify(raw)}`,
      );
    }

    return typeof raw?.text === "string" ? raw.text.trim() : null;
  }

  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_ANALYSIS_MODEL || "gemini-2.5-flash",
    contents: [
      {
        role: "user" as const,
        parts: [
          {
            text: "Please transcribe the audio in this file. Extract all spoken words, including any product names, brand names, or beauty-related terms mentioned. If there's no speech or the audio is unclear, indicate that. Provide only the transcription text without any additional commentary.",
          },
          {
            inlineData: {
              mimeType,
              data,
            },
          },
        ],
      },
    ],
  });

  return response.text?.trim() || null;
}
