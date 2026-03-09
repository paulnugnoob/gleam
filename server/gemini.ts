import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

if (!apiKey) {
  console.warn(
    "AI_INTEGRATIONS_GEMINI_API_KEY is not set. Gemini-backed features will fail until it is configured.",
  );
}

export const gemini = baseUrl
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl,
      },
    })
  : new GoogleGenAI({
      apiKey,
    });
