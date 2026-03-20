import { generateObject, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';

const routerSchema = z.object({
  intent: z.enum(['crypto_defi', 'general_chat', 'small_talk', 'technical_support', 'other']),
  confidence: z.number().min(0).max(1),
  recommendedModel: z.string(),
  reasoning: z.string().describe('Brief explanation of the routing decision'),
});

export type RouterDecision = z.infer<typeof routerSchema>;

const ROUTING_RULES = {
  crypto_defi: [
    'vault', 'strategy', 'rebalance', 'usdt', 'xaut', 'gold', 'crypto', 'defi',
    'yield', 'risk', 'depeg', 'peg', 'asset', 'allocation', 'emergency',
    'circuit', 'breaker', 'sharpe', 'bridge', 'cross-chain',
    'sepolia', 'ethereum', 'price', 'oracle', 'tether', 'stablecoin',
    'liquidity', 'apy', 'apr', 'transaction', 'wallet', 'deposit',
    'withdraw', 'swap', 'exchange', 'token', 'nft', 'smart contract'
  ],
  small_talk: [
    'hi', 'hello', 'hey', 'greetings', 'how are you', 'thanks', 'thank you',
    'cool', 'ok', 'who are you', 'bye', 'good morning', 'good afternoon',
    'good evening', 'what is your name', 'how do you do'
  ],
  technical_support: [
    'error', 'bug', 'issue', 'problem', 'not working', 'failed', 'exception',
    'crash', 'debug', 'fix', 'solution', 'help', 'support', 'how to', 'guide'
  ]
};

const MODEL_CONFIGS = {
  general_chat: {
    model: env.OPENROUTER_MODEL_GENERAL || 'google/gemini-2.5-flash-lite',
    description: 'General conversation and small talk'
  },
  crypto_defi: {
    model: env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast',
    description: 'DeFi, crypto, and yield optimization'
  },
  small_talk: {
    model: env.OPENROUTER_MODEL_GENERAL || 'google/gemini-2.5-flash-lite',
    description: 'Basic greetings and small talk'
  },
  technical_support: {
    model: env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast',
    description: 'Technical support and debugging'
  },
  other: {
    model: env.OPENROUTER_MODEL_GENERAL || 'google/gemini-2.5-flash-lite',
    description: 'General queries'
  }
};

export class LLMRouter {
  private openai: any;

  constructor() {
    this.openai = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    });
  }

  private fastRoute(query: string): RouterDecision {
    const lowerQuery = query.toLowerCase();

    for (const keyword of ROUTING_RULES.small_talk) {
      if (lowerQuery.includes(keyword)) {
        return {
          intent: 'small_talk',
          confidence: 0.9,
          recommendedModel: MODEL_CONFIGS.small_talk.model,
          reasoning: 'Detected small talk pattern'
        };
      }
    }

    for (const keyword of ROUTING_RULES.crypto_defi) {
      if (lowerQuery.includes(keyword)) {
        return {
          intent: 'crypto_defi',
          confidence: 0.85,
          recommendedModel: MODEL_CONFIGS.crypto_defi.model,
          reasoning: 'Detected crypto/DeFi keywords'
        };
      }
    }

    for (const keyword of ROUTING_RULES.technical_support) {
      if (lowerQuery.includes(keyword)) {
        return {
          intent: 'technical_support',
          confidence: 0.8,
          recommendedModel: MODEL_CONFIGS.technical_support.model,
          reasoning: 'Detected technical support keywords'
        };
      }
    }

    return {
      intent: 'general_chat',
      confidence: 0.7,
      recommendedModel: MODEL_CONFIGS.general_chat.model,
      reasoning: 'No specific patterns detected, defaulting to general chat'
    };
  }

  async smartRoute(query: string, conversationHistory: any[] = []): Promise<RouterDecision> {
    try {
      const fastDecision = this.fastRoute(query);

      if (fastDecision.confidence > 0.85) {
        logger.info({
          query: query.slice(0, 100),
          intent: fastDecision.intent,
          confidence: fastDecision.confidence,
          model: fastDecision.recommendedModel,
          method: 'fast'
        }, '[LLMRouter] Fast routing decision');
        
        return fastDecision;
      }

      const routerModel = this.openai.chat(env.OPENROUTER_MODEL_GENERAL || 'google/gemini-2.5-flash-lite');

      const result = await generateText({
        model: routerModel,
        temperature: 0,
        prompt: `Analyze the following user query and determine the best model to use.

User Query: "${query}"

Available Models:
1. General Chat Model: ${MODEL_CONFIGS.general_chat.model} - For general conversation, small talk
2. Crypto/DeFi Model: ${MODEL_CONFIGS.crypto_defi.model} - For crypto, DeFi, yield optimization
3. Technical Support Model: ${MODEL_CONFIGS.technical_support.model} - For debugging, errors

Instructions:
- Analyze the query intent and content
- Consider context from conversation history if provided
- Provide a routing decision with confidence level
- Keep reasoning brief (1-2 sentences)

Respond with JSON: {"intent": "...", "confidence": 0.0-1.0, "recommendedModel": "...", "reasoning": "..."}`,
      });

      const decision = JSON.parse(result.text) as RouterDecision;
      
      logger.info({
        query: query.slice(0, 100),
        intent: decision.intent,
        confidence: decision.confidence,
        model: decision.recommendedModel,
        reasoning: decision.reasoning,
        method: 'smart'
      }, '[LLMRouter] Smart routing decision');

      return decision;

    } catch (error) {
      logger.error(error, '[LLMRouter] Smart routing failed, falling back to fast routing');
      return this.fastRoute(query);
    }
  }

  getModelForIntent(intent: RouterDecision['intent']): typeof MODEL_CONFIGS[keyof typeof MODEL_CONFIGS] {
    return MODEL_CONFIGS[intent] || MODEL_CONFIGS.other;
  }

  async batchRoute(queries: string[]): Promise<RouterDecision[]> {
    const decisions: RouterDecision[] = [];
    for (const query of queries) {
      decisions.push(await this.smartRoute(query));
    }
    return decisions;
  }
}

export const llmRouter = new LLMRouter();
