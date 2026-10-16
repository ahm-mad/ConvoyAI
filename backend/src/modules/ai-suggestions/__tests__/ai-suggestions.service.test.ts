import { afterEach, describe, expect, it, vi } from 'vitest';

const completeChatMock = vi.fn();
vi.mock('../../../platform/ai/groq-client.js', () => ({ completeChat: completeChatMock }));

describe('AiSuggestionsService (module 6.3 — GroqAI::suggestRelevantAttributes ported exactly)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] when Groq returns nothing usable (unconfigured/failed) — matches GroqAI's own empty-array fallback", async () => {
    completeChatMock.mockResolvedValue(undefined);
    const { AiSuggestionsService } = await import('../ai-suggestions.service.js');
    const service = new AiSuggestionsService();

    const result = await service.highlightAttributes(['temp', 'humidity'], 'fridge monitoring');
    expect(result).toEqual([]);
  });

  it("splits the comma-separated response and trims each entry (explode(',', $output) + array_map('trim', ...))", async () => {
    completeChatMock.mockResolvedValue(' temp , humidity ,door_open');
    const { AiSuggestionsService } = await import('../ai-suggestions.service.js');
    const service = new AiSuggestionsService();

    const result = await service.highlightAttributes(
      ['temp', 'humidity', 'door_open', 'battery'],
      'fridge monitoring'
    );
    expect(result).toEqual(['temp', 'humidity', 'door_open']);
  });

  it('builds the exact same prompt text as GroqAI.php, including the keys list and context', async () => {
    completeChatMock.mockResolvedValue('temp');
    const { AiSuggestionsService } = await import('../ai-suggestions.service.js');
    const service = new AiSuggestionsService();

    await service.highlightAttributes(['temp', 'humidity'], 'fridge monitoring');

    expect(completeChatMock).toHaveBeenCalledWith(
      'You are an AI assistant helping to build IoT dashboards from sensor data. ' +
        'Here is a list of available sensor attributes: temp, humidity.\n' +
        "Given the user’s goal or context: 'fridge monitoring', identify the 3 or 4 most relevant attributes " +
        'to include in a dashboard widget. Return ONLY the selected attribute names as a comma-separated list — no explanation or additional text.'
    );
  });
});
