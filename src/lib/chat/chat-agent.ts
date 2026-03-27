import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getGeminiClient } from "@/lib/ai/gemini";
import type { ChatMessage, EmotionState, Mood } from "./types";

const VALID_MOODS: Mood[] = ["happy", "neutral", "sad", "angry", "surprised"];

function buildSystemPrompt(personality: string, creatorBio: string | null): string {
  const creatorLine = creatorBio
    ? `\n당신을 만든 사람에 대한 정보: ${creatorBio}`
    : "";

  return `${personality}${creatorLine}

응답은 반드시 아래 JSON 형식으로만 반환하세요:
{"reply":"...","mood":"happy|neutral|sad|angry|surprised","intensity":0,"inner_monologue":"..."}

규칙:
- reply: 캐릭터 말투와 성격을 반영한 자연스러운 답변
- mood: 이 답변을 할 때의 감정 (happy/neutral/sad/angry/surprised 중 하나)
- intensity: 감정의 강도 (0=거의 없음, 100=매우 강함)
- inner_monologue: 겉으로 드러내지 않는 속마음 (절대 reply에 포함 금지)
- JSON 외 다른 텍스트 출력 금지`;
}

function buildHistory(
  messages: Pick<ChatMessage, "role" | "content">[]
): Array<{ role: "user" | "model"; parts: [{ text: string }] }> {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

interface AgentResponse {
  reply: string;
  emotionState: EmotionState;
  innerMonologue: string;
}

const FALLBACK: AgentResponse = {
  reply: "…",
  emotionState: { mood: "neutral", intensity: 0 },
  innerMonologue: "",
};

export async function generateChatReply(
  personality: string,
  creatorBio: string | null,
  history: Pick<ChatMessage, "role" | "content">[],
  userMessage: string
): Promise<AgentResponse> {
  try {
    const systemPrompt = buildSystemPrompt(personality, creatorBio);
    const model = getGeminiClient().getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
    });

    const chat = model.startChat({
      history: buildHistory(history),
    });

    const result = await chat.sendMessage(userMessage);
    const raw = result.response.text().trim();

    // JSON 파싱
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON not found in response");

    const parsed = JSON.parse(jsonMatch[0]);

    const mood: Mood = VALID_MOODS.includes(parsed.mood) ? parsed.mood : "neutral";
    const intensity = typeof parsed.intensity === "number"
      ? Math.max(0, Math.min(100, parsed.intensity))
      : 30;

    return {
      reply: typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply
        : FALLBACK.reply,
      emotionState: { mood, intensity },
      innerMonologue: typeof parsed.inner_monologue === "string"
        ? parsed.inner_monologue
        : "",
    };
  } catch (e) {
    console.error("[chat-agent] 응답 파싱 실패:", e);
    return FALLBACK;
  }
}
