import { logger } from '@/utils/logger';
import { getOpenClawClient } from '@/services/openclaw-client';
import type { CouncilMember, CouncilVote, MarketContext } from '../council';

export class ZKRiskAnalyst implements CouncilMember {
  role = 'ZKRiskAnalyst';

  async analyze(context: MarketContext): Promise<CouncilVote> {
    logger.debug({ riskScore: context.riskScore, drawdown: context.drawdownProbabilityBps }, '[ZKRiskAnalyst] Analyzing');

    const openClaw = getOpenClawClient();
    const response = await openClaw.chatCompletions({
      model: 'openclaw-reasoning',
      messages: [
        {
          role: 'system',
          content: 'You are a ZK risk analyst. Analyze risk metrics and recommend: hold, risk-off, or rebalance. Consider drawdown probability and risk score.',
        },
        {
          role: 'user',
          content: `Risk score: ${context.riskScore}. Drawdown probability: ${context.drawdownProbabilityBps}bps. Volatility: ${context.volatility}%.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });

    const content = response.choices[0]?.message?.content || '';
    const confidence = this.extractConfidence(content, context.riskScore);

    let recommendation: CouncilVote['recommendation'] = 'hold';
    let xautSwapPercent = 0;

    if (context.drawdownProbabilityBps > 2000) {
      recommendation = 'risk-off';
      xautSwapPercent = Math.min(50, Math.floor(context.drawdownProbabilityBps / 100));
    } else if (context.riskScore > 70 || content.includes('risk-off')) {
      recommendation = 'risk-off';
      xautSwapPercent = 30;
    } else if (content.includes('rebalance') || context.riskScore > 50) {
      recommendation = 'rebalance';
    }

    return {
      role: this.role,
      recommendation,
      confidence,
      reasoning: `Risk ${context.riskScore}, drawdown ${context.drawdownProbabilityBps}bps, XAUt swap ${xautSwapPercent}%: ${content.slice(0, 100)}`,
    };
  }

  private extractConfidence(content: string, riskScore: number): number {
    const match = content.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    if (match) return Math.min(1, parseFloat(match[1]) / 100);
    return riskScore < 30 ? 0.8 : riskScore < 60 ? 0.6 : 0.4;
  }
}
