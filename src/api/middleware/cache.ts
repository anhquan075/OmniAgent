import {
  type LanguageModelV3Middleware,
  simulateReadableStream,
} from 'ai';

// Simple in-memory cache for demo purposes
const cache = new Map<string, any>();

export const cacheMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);

    if (cache.has(cacheKey)) {
      console.log('[Cache] Hit (Generate)');
      return cache.get(cacheKey);
    }

    const result = await doGenerate();
    cache.set(cacheKey, result);
    return result;
  },
  wrapStream: async ({ doStream, params }) => {
    const cacheKey = JSON.stringify(params);

    if (cache.has(cacheKey)) {
      console.log('[Cache] Hit (Stream)');
      const cachedChunks = cache.get(cacheKey);
      return {
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 10,
          chunks: cachedChunks,
        }),
      };
    }

    const { stream, ...rest } = await doStream();
    const chunks: any[] = [];

    const transformStream = new TransformStream<any, any>({
      transform(chunk, controller) {
        chunks.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        cache.set(cacheKey, chunks);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};
