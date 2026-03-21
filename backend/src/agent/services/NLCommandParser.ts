import { logger } from '@/utils/logger';
import { env } from '@/config/env';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export type IntentType = 'HEDGE' | 'YIELD' | 'TRANSFER' | 'QUERY' | 'COMMAND';

export interface IntentResult {
  type: IntentType;
  confidence: number;
  action: string;
  params: Record<string, any>;
  rawInput: string;
  method: 'pattern' | 'llm';
}

export interface AgentContext {
  walletAddress?: string;
  portfolio?: Record<string, any>;
  riskProfile?: 'low' | 'medium' | 'high';
}

/** @deprecated Use IntentResult instead */
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

interface IntentPattern {
  pattern: RegExp;
  type: IntentType;
  action: string;
  params: Record<string, any>;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // HEDGE patterns - protect/preserve capital
  {
    pattern: /protect (my )?(savings|money|funds|capital|assets)/i,
    type: 'HEDGE',
    action: 'move_to_stablecoin',
    params: { target: 'USDT', scope: 'all' }
  },
  {
    pattern: /hedge against (inflation|dollar|usd|volatility|crash)/i,
    type: 'HEDGE',
    action: 'move_to_gold',
    params: { target: 'XAUT', scope: 'all' }
  },
  {
    pattern: /keep (my )?(money|funds|savings) (safe|secure|stable)/i,
    type: 'HEDGE',
    action: 'move_to_stablecoin',
    params: { target: 'USDT', scope: 'all' }
  },
  {
    pattern: /(move|shift|convert) (to |into )?(stablecoins?|usdt)/i,
    type: 'HEDGE',
    action: 'move_to_stablecoin',
    params: { target: 'USDT', scope: 'all' }
  },

  // YIELD patterns - grow/optimize returns
  {
    pattern: /grow (my )?(money|funds|savings|portfolio|investment)/i,
    type: 'YIELD',
    action: 'supply_to_aave',
    params: { asset: 'USDT', protocol: 'aave_v3' }
  },
  {
    pattern: /earn (more |higher )?(yield|interest|returns|apy)/i,
    type: 'YIELD',
    action: 'optimize_yield',
    params: { strategy: 'highest_apy' }
  },
  {
    pattern: /(deposit|supply) (to |into )?aave/i,
    type: 'YIELD',
    action: 'supply_to_aave',
    params: { protocol: 'aave_v3' }
  },
  {
    pattern: /maximize (my )?(yield|returns|earnings)/i,
    type: 'YIELD',
    action: 'optimize_yield',
    params: { strategy: 'highest_apy' }
  },

  // TRANSFER patterns - move funds
  {
    pattern: /send \$?(\d+(?:\.\d+)?) (to|to address) (0x[a-fA-F0-9]{40})/i,
    type: 'TRANSFER',
    action: 'transfer_usdt',
    params: { amount: '$1', recipient: '$3' }
  },
  {
    pattern: /transfer (my )?(usdt|funds|money)/i,
    type: 'TRANSFER',
    action: 'transfer_usdt',
    params: { scope: 'specified' }
  },
  {
    pattern: /bridge (to )?(arbitrum|polygon|base)/i,
    type: 'TRANSFER',
    action: 'bridge',
    params: { chain: '$1' }
  },

  // QUERY patterns - information requests
  {
    pattern: /what('s| is) my balance/i,
    type: 'QUERY',
    action: 'get_balance',
    params: {}
  },
  {
    pattern: /how much (am i|did i) (earn|make|gain)/i,
    type: 'QUERY',
    action: 'get_yield_info',
    params: {}
  },
  {
    pattern: /(show|display|what('s| is)) (my )?(portfolio|positions|holdings)/i,
    type: 'QUERY',
    action: 'get_portfolio',
    params: {}
  },
  {
    pattern: /what('s| is) (the )?(current )?(risk|apy|yield)/i,
    type: 'QUERY',
    action: 'get_risk_metrics',
    params: {}
  },
];

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

  async parseIntent(input: string, context?: AgentContext): Promise<IntentResult> {
    const trimmedInput = input.trim();

    // Layer 1: Pattern matching (high confidence)
    for (const { pattern, type, action, params } of INTENT_PATTERNS) {
      const match = trimmedInput.match(pattern);
      if (match) {
        const extractedParams = this.extractPatternParams(match, params);
        logger.info({ type, action, method: 'pattern', input: trimmedInput }, '[NLCommandParser] Intent matched');
        return {
          type,
          action,
          params: extractedParams,
          confidence: 0.95,
          rawInput: trimmedInput,
          method: 'pattern'
        };
      }
    }

    // Layer 2: Fall back to LLM for complex intents
    if (this.llmFallbackEnabled) {
      return await this.llmIntentFallback(trimmedInput, context);
    }

    // Layer 3: Check if it's a legacy command
    const legacyCommand = await this.parse(trimmedInput);
    if (legacyCommand.confidence > 0.8) {
      return {
        type: 'COMMAND',
        action: legacyCommand.action,
        params: legacyCommand.params,
        confidence: legacyCommand.confidence,
        rawInput: trimmedInput,
        method: legacyCommand.method
      };
    }

    return {
      type: 'QUERY',
      action: 'unknown',
      params: { originalInput: trimmedInput },
      confidence: 0,
      rawInput: trimmedInput,
      method: 'pattern'
    };
  }

  private extractPatternParams(match: RegExpMatchArray, template: Record<string, any>): Record<string, any> {
    const params: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        const index = parseInt(value.slice(1), 10);
        params[key] = match[index] || value;
      } else {
        params[key] = value;
      }
    }
    return params;
  }

  private async llmIntentFallback(input: string, context?: AgentContext): Promise<IntentResult> {
    try {
      const openai = createOpenAI({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      });

      const contextInfo = context?.walletAddress ? `\nUser wallet: ${context.walletAddress}` : '';
      const riskInfo = context?.riskProfile ? `\nUser risk profile: ${context.riskProfile}` : '';

      const result = await generateText({
        model: openai(env.OPENROUTER_MODEL_CRYPTO || 'x-ai/grok-4.1-fast'),
        temperature: 0,
        prompt: `Parse this DeFi user intent and classify it:
User message: "${input}"${contextInfo}${riskInfo}

Classify the intent into one of these categories:
- HEDGE: Protect/preserve capital (move to stablecoins or gold)
- YIELD: Grow/earn returns (supply to protocols, optimize yield)
- TRANSFER: Move funds (send, bridge, swap)
- QUERY: Ask for information (balance, portfolio, metrics)
- COMMAND: Direct protocol command (supply, withdraw, pause)

Also extract any relevant parameters (amount, recipient, token, protocol, etc.)

Respond with JSON only:
{
  "type": "HEDGE|YIELD|TRANSFER|QUERY|COMMAND",
  "action": "specific_action_name",
  "params": { /* relevant parameters */ },
  "confidence": 0.0-1.0
}`,
      });

      const parsed = JSON.parse(result.text);
      logger.info({ type: parsed.type, action: parsed.action, method: 'llm', input }, '[NLCommandParser] LLM intent parsed');

      return {
        type: parsed.type || 'QUERY',
        action: parsed.action || 'unknown',
        params: parsed.params || { originalInput: input },
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        rawInput: input,
        method: 'llm'
      };
    } catch (error) {
      logger.warn({ error, input }, '[NLCommandParser] LLM intent fallback failed');
      return {
        type: 'QUERY',
        action: 'unknown',
        params: { originalInput: input },
        confidence: 0,
        rawInput: input,
        method: 'llm'
      };
    }
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
