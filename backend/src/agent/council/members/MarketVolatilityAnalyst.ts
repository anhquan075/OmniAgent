import { logger } from '@/utils/logger';
import { getOpenClawClient } from '@/services/openclaw-client';
import type { CouncilMember, CouncilVote, MarketContext } from '../council';

export class MarketVolatilityAnalyst implements CouncilMember {
  role = 'MarketVolatilityAnalyst';

  async analyze(context: MarketContext): Promise<CouncilVote> {
    logger.debug({ volatility: context.volatility }, '[MarketVolatilityAnalyst] Analyzing');

    const openClaw = getOpenClawClient();
    const response = await openClaw.chatCompletions({
      model: 'openclaw-reasoning',
      messages: [
        {
          role: 'system',
          content: 'You are a market volatility analyst. Analyze volatility and recommend: hold, risk-off, or rebalance.',
        },
        {
          role: 'user',
          content: `Current volatility: ${context.volatility}%. Risk score: ${context.riskScore}. Drawdown probability: ${context.drawdownProbabilityBps}bps.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const confidence = this.extractConfidence(content, context.volatility);

    let recommendation: CouncilVote['recommendation'] = 'hold';
    if (content.includes('risk-off') || context.volatility > 30 || context.drawdownProbabilityBps > 2000) {
      recommendation = 'risk-off';
    } else if (content.includes('rebalance') || context.volatility > 20) {
      recommendation = 'rebalance';
    }

    return {
      role: this.role,
      recommendation,
      confidence,
      reasoning: `Volatility ${context.volatility}%: ${content.slice(0, 100)}`,
    };
  }

  private extractConfidence(content: string, volatility: number): number {
    const match = content.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    if (match) return Math.min(1, parseFloat(match[1]) / 100);
    return volatility < 15 ? 0.8 : volatility < 25 ? 0.6 : 0.4;
  }
}
