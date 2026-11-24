import type { GeneratedContent, GenerateRequest } from "./types";
import { generateContent as generateOpenAI } from "./writer";
import { generateContentClaude } from "./claude-writer";

export async function generate(req: GenerateRequest): Promise<GeneratedContent> {
  const provider = req.provider ?? "openai";

  if (provider === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY não está configurada no .env");
    }
    return generateContentClaude(req);
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não está configurada no .env");
  }
  return generateOpenAI(req);
}
