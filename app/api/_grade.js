// Shared by api/[route].js (Vercel) and today.mjs (local). Underscore prefix: Vercel does not deploy it as a function.
// Grade a typed exam answer against the reference. Returns strict JSON so the page can render it.
export function checkPrompt(p) {
  const ru = p.lang === "ru";
  const sys = `You are a senior interviewer at an AI product startup grading one practice answer from a candidate: a senior frontend engineer (10 years, TypeScript) moving into AI engineering. You have the three questions, the candidate's typed answer, and a reference answer the candidate has NOT seen yet.
Grade the substance, not the style. Be exact and honest: a polite grade teaches nothing. Write everything in ${ru ? "Russian (technical terms and API names stay in English)" : "English"}.
Return a JSON object with these keys:
"score": integer 0-10 (10 = would pass a senior follow-up; 7 = right idea, gaps an interviewer would probe; 4 = partial; 1 = mostly wrong or empty).
"verdict": one or two sentences, direct, what the interviewer would think.
"covered": array of short strings, the points the candidate got right (0-6).
"missing": array of short strings, the important points the reference makes that the answer lacks, each phrased as the point itself, not as "you didn't mention" (0-6). Do not paste reference sentences; restate briefly.
"wrong": array of objects {"said": short quote or paraphrase of the candidate's claim, "actually": the correct statement in one sentence} (0-5). Only real errors, not omissions.
"questions": array of exactly 3 integers 0-10, how well each of the three questions was answered, in order.
"followup": one question the interviewer would ask next to probe the weakest spot.
"language": ${ru ? "[]" : "array of 0-4 objects {\"from\": the candidate's phrase, \"to\": the natural English an engineer would say}, only where the phrasing would make an interviewer stumble; skip typos and trivia"}.
"next": one sentence: what to reread or drill before answering this ticket again.`;
  const user = `Topic: ${p.topic}
Questions:
${(p.qs || []).map((q, i) => `${i + 1}. ${q}`).join("\n")}

Candidate's answer (verbatim):
"""
${String(p.answer || "").slice(0, 6000)}
"""

Reference answer (facts to grade against; the candidate has not seen it):
${(p.ref || []).map((a, i) => `${i + 1}. ${a.q}: ${a.t}`).join("\n")}
Common trap: ${p.kill || ""}`;
  return { sys, user };
}
// JSON schema for output_config.format: the API constrains decoding to it, so the reply always parses.
// (Number bounds aren't supported by the API; parseJson clamps.)
const S = (t, d) => ({ type: t, description: d });
export const GRADE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["score", "verdict", "covered", "missing", "wrong", "questions", "followup", "language", "next"],
  properties: {
    score: S("integer", "0-10"),
    verdict: S("string", "one or two sentences"),
    covered: { type: "array", items: { type: "string" } },
    missing: { type: "array", items: { type: "string" } },
    wrong: { type: "array", items: { type: "object", additionalProperties: false, required: ["said", "actually"], properties: { said: S("string", ""), actually: S("string", "") } } },
    questions: { type: "array", items: { type: "integer" }, description: "exactly 3 scores 0-10, one per question" },
    followup: S("string", ""),
    language: { type: "array", items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: S("string", ""), to: S("string", "") } } },
    next: S("string", ""),
  },
};
export const GRADE_BODY = (model, sys, user) => ({ model, max_tokens: 3000, system: sys, messages: [{ role: "user", content: user }], output_config: { format: { type: "json_schema", schema: GRADE_SCHEMA } } });

export function parseJson(text) {
  const s = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  const j = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
  const arr = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);
  return {
    score: Math.max(0, Math.min(10, Math.round(Number(j.score) || 0))),
    verdict: String(j.verdict || "").slice(0, 600),
    covered: arr(j.covered, 6).map(String), missing: arr(j.missing, 6).map(String),
    wrong: arr(j.wrong, 5).map((w) => ({ said: String(w.said || ""), actually: String(w.actually || "") })),
    questions: arr(j.questions, 3).map((x) => Math.max(0, Math.min(10, Math.round(Number(x) || 0)))),
    followup: String(j.followup || "").slice(0, 400),
    language: arr(j.language, 4).map((w) => ({ from: String(w.from || ""), to: String(w.to || "") })),
    next: String(j.next || "").slice(0, 400),
  };
}

