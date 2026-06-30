import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageDataUrl: z.string().min(20),
  holes: z.union([z.literal(9), z.literal(18)]),
});

export type ScanResult = {
  scores: (number | null)[];
  pars?: (number | null)[];
  courseName?: string | null;
};

export const scanScorecard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ScanResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const sys = `You are an expert at reading golf scorecards from photos. Extract the player's stroke scores for each hole. If multiple players appear, pick the first or most prominent player row. Return strict JSON only.`;

    const userText = `Extract scores for ${data.holes} holes. Respond with JSON: {"courseName": string|null, "pars": number[] (length ${data.holes}, use null if unknown), "scores": number[] (length ${data.holes}, use null for blanks)}. No prose, no markdown.`;

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: data.imageDataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace billing settings.");
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const normalize = (arr: any): (number | null)[] => {
      const out: (number | null)[] = [];
      for (let i = 0; i < data.holes; i++) {
        const v = Array.isArray(arr) ? arr[i] : null;
        const n = typeof v === "number" ? v : v == null ? null : Number(v);
        out.push(Number.isFinite(n) ? (n as number) : null);
      }
      return out;
    };

    return {
      courseName: parsed.courseName ?? null,
      pars: normalize(parsed.pars),
      scores: normalize(parsed.scores),
    };
  });
