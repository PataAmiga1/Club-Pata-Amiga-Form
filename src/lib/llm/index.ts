import type { LLMProvider } from "./types";
import { MockProvider } from "./mock";
import { AnthropicProvider } from "./anthropic";

export type { AgentParams, AgentTool, ChatMessage, LLMProvider, VetContext } from "./types";
export { isUrgent } from "./urgency";
export { SUPPORT_TOOLS, executeSupportTool, herramientasDeSoporte } from "./support-tools";
export { buildSupportSystemPrompt } from "./support-prompt";

/** Provider selection via env — swap without touching callers. */
export function getLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "mock";
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider();
  }
  return new MockProvider();
}
