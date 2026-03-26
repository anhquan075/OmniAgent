import { logger } from '@/utils/logger';
import { getOpenClawClient } from '@/services/openclaw-client';

export interface CouncilVote {
  role: string;
  recommendation: 'hold' | 'risk-off' | 'yield-chase' | 'rebalance';
  confidence: number;
  reasoning: string;
}

export interface CouncilConsensus {
  decision: 'hold' | 'risk-off' | 'yield-chase' | 'rebalance';
  confidence: number;
  votes: CouncilVote[];
  reasoning: string;
}

export interface MarketContext {
  vaultBalance: string;
  aaveApy: number;
  volatility: number;
  riskScore: number;
  drawdownProbabilityBps: number;
}

export interface CouncilMember {
  role: string;
  analyze(context: MarketContext): Promise<CouncilVote>;
}

export class CouncilOfExperts {
  private members: CouncilMember[] = [];
  private timeoutMs: number = 10000;

  addMember(member: CouncilMember): void {
    this.members.push(member);
    logger.info({ role: member.role }, '[Council] Member added');
  }

  async deliberate(context: MarketContext): Promise<CouncilConsensus> {
    logger.info({ memberCount: this.members.length }, '[Council] Starting deliberation');

    const votes = await Promise.allSettled(
      this.members.map(member => this.voteWithTimeout(member, context))
    );

    const validVotes: CouncilVote[] = [];
    for (const result of votes) {
      if (result.status === 'fulfilled') {
        validVotes.push(result.value);
      } else {
        logger.warn({ error: result.reason }, '[Council] Member vote failed');
      }
    }

    if (validVotes.length === 0) {
      return {
        decision: 'hold',
        confidence: 0,
        votes: [],
        reasoning: 'All council members failed to vote',
      };
    }

    return this.consensus(validVotes);
  }

  private async voteWithTimeout(member: CouncilMember, context: MarketContext): Promise<CouncilVote> {
    return Promise.race([
      member.analyze(context),
      new Promise<CouncilVote>((_, reject) =>
        setTimeout(() => reject(new Error(`Vote timeout for ${member.role}`)), this.timeoutMs)
      ),
    ]);
  }

  private consensus(votes: CouncilVote[]): CouncilConsensus {
    const decisionVotes: Record<string, { count: number; totalConfidence: number; reasons: string[] }> = {};

    for (const vote of votes) {
      if (!decisionVotes[vote.recommendation]) {
        decisionVotes[vote.recommendation] = { count: 0, totalConfidence: 0, reasons: [] };
      }
      decisionVotes[vote.recommendation].count++;
      decisionVotes[vote.recommendation].totalConfidence += vote.confidence;
      decisionVotes[vote.recommendation].reasons.push(`${vote.role}: ${vote.reasoning}`);
    }

    let bestDecision: 'hold' | 'risk-off' | 'yield-chase' | 'rebalance' = 'hold';
    let bestScore = 0;

    for (const [decision, data] of Object.entries(decisionVotes)) {
      const avgConfidence = data.totalConfidence / data.count;
      const score = data.count * avgConfidence;
      if (score > bestScore) {
        bestScore = score;
        bestDecision = decision as typeof bestDecision;
      }
    }

    const winningVotes = votes.filter(v => v.recommendation === bestDecision);
    const avgConfidence = winningVotes.reduce((sum, v) => sum + v.confidence, 0) / winningVotes.length;

    return {
      decision: bestDecision,
      confidence: avgConfidence,
      votes,
      reasoning: decisionVotes[bestDecision]?.reasons.join('; ') || 'No consensus',
    };
  }
}

let councilInstance: CouncilOfExperts | null = null;

export function getCouncil(): CouncilOfExperts {
  if (!councilInstance) {
    councilInstance = new CouncilOfExperts();
  }
  return councilInstance;
}
