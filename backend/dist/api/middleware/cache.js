"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheMiddleware = void 0;
const ai_1 = require("ai");
// Simple in-memory cache for demo purposes
const cache = new Map();
exports.cacheMiddleware = {
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
            const cachedResult = cache.get(cacheKey);
            return {
                ...cachedResult,
                stream: (0, ai_1.simulateReadableStream)({
                    chunks: cachedResult.fullStream,
                }),
            };
        }
        const { stream, ...rest } = await doStream();
        const fullStream = [];
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
