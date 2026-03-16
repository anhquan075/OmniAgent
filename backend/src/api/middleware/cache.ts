import {
  type LanguageModelMiddleware,
  simulateReadableStream,
} from 'ai';
// Simple in-memory cache for demo purposes
const cache = new Map<string, any>();

export const cacheMiddleware: any = {
  wrapGenerate: async ({ doGenerate, params }: any) => {
    const cacheKey = JSON.stringify(params);
    if (cache.has(cacheKey)) {
      console.log('[Cache] Hit (Generate)');
      return cache.get(cacheKey);
    }

    const result = await doGenerate();
    cache.set(cacheKey, result);
    return result;
  },

  wrapStream: async ({ doStream, params }: any) => {
    const cacheKey = JSON.stringify(params);

    if (cache.has(cacheKey)) {
      console.log('[Cache] Hit (Stream)');
      const cachedResult = cache.get(cacheKey);
      return {
        ...cachedResult,
        stream: simulateReadableStream({
          chunks: cachedResult.fullStream,
        }),
      };
    }

    const { stream, ...rest } = await doStream();
    const fullStream: any[] = [];

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        fullStream.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        cache.set(cacheKey, { ...rest, fullStream });
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
