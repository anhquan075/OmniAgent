import { logger } from '@/utils/logger';
import { getOpenClawClient } from '@/services/openclaw-client';
import type { CouncilMember, CouncilVote, MarketContext } from '../council';

export class AaveAnalyst implements CouncilMember {
  role = 'AaveAnalyst';

  async analyze(context: MarketContext): Promise<CouncilVote> {
    logger.debug({ aaveApy: context.aaveApy }, '[AaveAnalyst] Analyzing');

    const openClaw = getOpenClawClient();
    const response = await openClaw.chatCompletions({
      model: 'openclaw-reasoning',
      messages: [
        {
          role: 'system',
          content: 'You are an Aave lending analyst. Analyze the current APY and recommend: hold, yield-chase, or rebalance.',
        },
        {
          role: 'user',
          content: `Current Aave APY: ${context.aaveApy}%. Vault balance: ${context.vaultBalance}. Risk score: ${context.riskScore}.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const confidence = this.extractConfidence(content, context.aaveApy);

    let recommendation: CouncilVote['recommendation'] = 'hold';
    if (content.includes('yield-chase') || context.aaveApy > 10) {
      recommendation = 'yield-chase';
    } else if (content.includes('rebalance') || context.aaveApy < 5) {
      recommendation = 'rebalance';
    }

    return {
      role: this.role,
      recommendation,
      confidence,
      reasoning: `Aave APY ${context.aaveApy}%: ${content.slice(0, 100)}`,
    };
  }

  private extractConfidence(content: string, apy: number): number {
    const match = content.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    if (match) return Math.min(1, parseFloat(match[1]) / 100);
    return apy > 8 ? 0.8 : apy > 5 ? 0.6 : 0.4;
  }
}
