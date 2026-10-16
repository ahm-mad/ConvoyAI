import { completeChat } from '../../platform/ai/groq-client.js';

/**
 * Business logic for module 6.3 — `GroqAI::suggestRelevantAttributes`
 * ported exactly (prompt text included): builds the same IoT-dashboard
 * prompt, delegates the actual HTTP call to the generic
 * `platform/ai/groq-client.ts`, parses the response the same way
 * (`explode(',', $output)` + `trim` each — no filtering of empty entries,
 * matching Laravel bug-for-bug since this is inherently non-deterministic
 * LLM output with no real behavior worth diverging from).
 */
export class AiSuggestionsService {
  async highlightAttributes(keys: string[], context: string): Promise<string[]> {
    const prompt = buildPrompt(keys, context);
    const output = await completeChat(prompt);
    if (typeof output !== 'string') return [];
    return output.split(',').map(s => s.trim());
  }
}

function buildPrompt(keys: string[], context: string): string {
  return (
    'You are an AI assistant helping to build IoT dashboards from sensor data. ' +
    `Here is a list of available sensor attributes: ${keys.join(', ')}.\n` +
    `Given the user’s goal or context: '${context}', identify the 3 or 4 most relevant attributes ` +
    'to include in a dashboard widget. Return ONLY the selected attribute names as a comma-separated list — no explanation or additional text.'
  );
}
