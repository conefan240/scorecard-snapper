import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  query: z.string().min(1).max(120),
  holes: z.union([z.literal(9), z.literal(18)]),
});

export type CourseSuggestion = {
  name: string;
  location?: string | null;
  pars: (number | null)[];
};

export const suggestCourses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ suggestions: CourseSuggestion[] }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const sys = `You are a golf course database assistant. Given a partial course name, return up to 6 real, well-known golf courses that match. For each course, provide the par for each of the ${data.holes} holes if you are reasonably confident; otherwise use null. Respond with strict JSON only.`;

    const userText = `Partial course name: "${data.query}"
Return JSON: {"suggestions": [{"name": string, "location": string|null, "pars": number[] (length ${data.holes}, use null for unknown holes)}]}
Only include real courses you actually know. If none match, return {"suggestions": []}. No prose, no markdown.`;

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userText },
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

    const rawList: any[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const suggestions: CourseSuggestion[] = rawList.slice(0, 6).map((s) => {
      const pars: (number | null)[] = [];
      for (let i = 0; i < data.holes; i++) {
        const v = Array.isArray(s?.pars) ? s.pars[i] : null;
        const n = typeof v === "number" ? v : v == null ? null : Number(v);
        pars.push(n != null && Number.isFinite(n) && n >= 3 && n <= 6 ? (n as number) : null);
      }
      return {
        name: String(s?.name ?? "").slice(0, 120),
        location: s?.location ? String(s.location).slice(0, 120) : null,
        pars,
      };
    }).filter((s) => s.name.length > 0);

    return { suggestions };
  });
