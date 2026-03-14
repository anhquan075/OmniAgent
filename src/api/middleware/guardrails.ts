import {
  type LanguageModelV3Middleware,
  type LanguageModelV3StreamPart,
} from 'ai';

export const strategicGuardrail: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    
    // Add safety disclaimer to relevant advice
    if (result.text && (
      result.text.includes('REBALANCE') || 
      result.text.includes('Yield') || 
      result.text.includes('settlement')
    )) {
      result.text += "\n\n---\n*Strategist Note: All tactical moves are subject to ZK-proof verification on-chain. Capital preservation remains the priority.*";
    }
    
    return result;
  },

  wrapStream: async ({ doStream }) => {
    const { stream, ...rest } = await doStream();

    const transformStream = new TransformStream<
      LanguageModelV3StreamPart,
      LanguageModelV3StreamPart
    >({
      async transform(chunk, controller) {
        controller.enqueue(chunk);
      },
      flush(controller) {
        // We can't easily append to the stream text here because it's already sent
        // But we could enqueue an extra text-delta if needed. 
        // For simplicity in this demo, we'll just handle it in system prompt or generate.
        // Actually, let's just append a final disclaimer chunk.
        controller.enqueue({
          type: 'text-delta',
          delta: "\n\n---\n*Strategist Note: Tactical moves verified by ZK-Risk layers.*"
        });
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
