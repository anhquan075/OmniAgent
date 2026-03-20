import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface ParsedCommand {
  action: string;
  params: Record<string, any>;
  confidence: number;
  method: 'pattern' | 'llm';
}

interface CommandPattern {
  pattern: RegExp;
  action: string;
  extractParams: (match: RegExpMatchArray) => Record<string, any>;
}

const COMMAND_PATTERNS: CommandPattern[] = [
  {
    pattern: /^supply\s+(\d+(?:\.\d+)?)\s+(usdt|xaut)/i,
    action: 'supply',
    extractParams: (match) => ({
      amount: match[1],
      token: match[2].toUpperCase()
    })
  },
  {
    pattern: /^withdraw\s+(\d+(?:\.\d+)?)\s+(usdt|xaut)/i,
    action: 'withdraw',
    extractParams: (match) => ({
      amount: match[1],
      token: match[2].toUpperCase()
    })
  },
  {
    pattern: /^status/i,
    action: 'status',
    extractParams: () => ({})
  },
  {
    pattern: /^pause/i,
    action: 'pause',
    extractParams: () => ({})
  },
  {
    pattern: /^resume/i,
    action: 'resume',
    extractParams: () => ({})
  },
  {
    pattern: /^emergency\s+withdraw/i,
    action: 'emergency_withdraw',
    extractParams: () => ({})
  },
  {
    pattern: /^set\s+(?:max\s+)?risk\s+(low|medium|high)/i,
    action: 'set_risk_level',
    extractParams: (match) => ({
      level: match[1].toUpperCase()
    })
  },
  {
    pattern: /^show\s+(?:my\s+)?(positions?|holdings?|portfolio)/i,
    action: 'show_portfolio',
    extractParams: () => ({})
  }
];

export class NLCommandParser {
  private llmFallbackEnabled: boolean;

  constructor(llmFallbackEnabled: boolean = true) {
    this.llmFallbackEnabled = llmFallbackEnabled;
  }

  async parse(input: string): Promise<ParsedCommand> {
    const trimmedInput = input.trim();
    
    for (const { pattern, action, extractParams } of COMMAND_PATTERNS) {
      const match = trimmedInput.match(pattern);
      if (match) {
        logger.info({ action, method: 'pattern', input: trimmedInput }, '[NLCommandParser] Matched pattern');
        return {
          action,
          params: extractParams(match),
          confidence: 1.0,
          method: 'pattern'
        };
      }
    }
    
    if (this.llmFallbackEnabled) {
      return await this.llmFallback(trimmedInput);
    }
    
    logger.warn({ input: trimmedInput }, '[NLCommandParser] No pattern match, returning unknown');
    return {
      action: 'unknown',
      params: { originalInput: trimmedInput },
      confidence: 0,
      method: 'pattern'
    };
  }

  private async llmFallback(input: string): Promise<ParsedCommand> {
    try {
      const openai = createOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      });

      const result = await generateText({
        model: openai(env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
        temperature: 0,
        prompt: `Parse this DeFi agent command and extract intent:
Command: "${input}"

Return JSON with:
- action: one of ["supply", "withdraw", "status", "pause", "resume", "emergency_withdraw", "set_risk_level", "show_portfolio", "unknown"]
- params: object with relevant parameters (amount, token, level, etc.)
- confidence: 0-1 indicating how confident you are in the parsing

Respond with JSON only.`,
      });

      const parsed = JSON.parse(result.text);
      logger.info({ action: parsed.action, method: 'llm', input }, '[NLCommandParser] LLM fallback parsed');
      
      return {
        action: parsed.action || 'unknown',
        params: parsed.params || { originalInput: input },
        confidence: parsed.confidence || 0.5,
        method: 'llm'
      };
    } catch (error) {
      logger.warn({ error, input }, '[NLCommandParser] LLM fallback failed');
      return {
        action: 'unknown',
        params: { originalInput: input },
        confidence: 0,
        method: 'llm'
      };
    }
  }

  addPattern(pattern: RegExp, action: string, extractParams: (match: RegExpMatchArray) => Record<string, any>): void {
    COMMAND_PATTERNS.push({ pattern, action, extractParams });
  }

  disableLlmFallback(): void {
    this.llmFallbackEnabled = false;
  }

  enableLlmFallback(): void {
    this.llmFallbackEnabled = true;
  }
}

let globalParser: NLCommandParser | null = null;

export function getNLCommandParser(): NLCommandParser {
  if (!globalParser) {
    globalParser = new NLCommandParser();
  }
  return globalParser;
}
