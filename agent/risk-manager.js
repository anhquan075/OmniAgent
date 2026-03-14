import axios from 'axios';

/**
 * RiskManager analyzes ZK-verified risk signals and determines 
 * if emergency actions (pausing, safe-haven rebalance) are needed.
 */
export class RiskManager {
  constructor(zkOracleContract, circuitBreakerContract, wdk) {
    this.zkOracle = zkOracleContract;
    this.breaker = circuitBreakerContract;
    this.wdk = wdk;
    
    // Thresholds
    this.HIGH_RISK_DRAWDOWN_BPS = 2000; // 20% expected drawdown
    this.MEDIUM_RISK_DRAWDOWN_BPS = 1000; // 10% expected drawdown
  }

  async getAIRiskScore(txSimulation, currentProfile) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('[RiskManager] WARNING: OPENROUTER_API_KEY not set. Skipping AI risk scoring.');
      return { score: 0, explanation: 'Skipped due to missing API key' };
    }

    const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';
    console.error(`[RiskManager] Consulting ${model} for risk analysis...`);
    
    const prompt = `DeFi Risk Analysis. 
Profile: ${JSON.stringify(currentProfile)}
Sim: ${JSON.stringify(txSimulation)}
Provide score 0-100 (100 is high risk) and brief explanation. 
Respond in JSON: { "score": Number, "explanation": "String" }`;

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'TetherProof AFOS Agent'
    };

    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' }
      }, { headers, timeout: 12000 });

      let content = response.data.choices[0].message.content;
      if (typeof content === 'string') content = JSON.parse(content);
      
      console.error(`[RiskManager] AI Risk Score: ${content.score}/100. Reason: ${content.explanation}`);
      return content;
    } catch (e) {
      console.error(`[RiskManager] AI Risk Scoring failed or timed out (${model}): ${e.message}`);
      
      // Fast Fallback
      if (model !== 'google/gemini-2.0-flash-001') {
        console.error(`[RiskManager] Attempting fast fallback to Gemini 2.0 Flash...`);
        try {
          const fbRes = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'google/gemini-2.0-flash-001',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
          }, { headers, timeout: 8000 });

          let fbContent = fbRes.data.choices[0].message.content;
          if (typeof fbContent === 'string') fbContent = JSON.parse(fbContent);
          console.error(`[RiskManager] Fallback Success: ${fbContent.score}/100`);
          return fbContent;
        } catch (fbErr) {
          console.error(`[RiskManager] Fallback failed: ${fbErr.message}`);
        }
      }

      return { score: 50, explanation: `Safety fallback: AI scoring unreachable (${e.message})` };
    }
  }

  async getRiskProfile() {
    try {
      const address = await this.zkOracle.getAddress();
      const runner = this.zkOracle.runner;
      const code = await runner.provider.getCode(address);
      if (code === '0x') {
        console.error(`[RiskManager] WARNING: ZK Oracle at ${address} is not a contract. Defaulting to LOW risk.`);
        return { level: 'LOW', drawdownBps: 0, sharpe: 0, recommendedBuffer: 500, timestamp: Math.floor(Date.now() / 1000) };
      }

      const metrics = await this.zkOracle.getVerifiedRiskBands();
      const drawdown = Number(metrics.monteCarloDrawdownBps);
      
      let level = 'LOW';
      if (drawdown >= this.HIGH_RISK_DRAWDOWN_BPS) level = 'HIGH';
      else if (drawdown >= this.MEDIUM_RISK_DRAWDOWN_BPS) level = 'MEDIUM';

      return {
        level,
        drawdownBps: drawdown,
        sharpe: Number(metrics.verifiedSharpeRatio),
        recommendedBuffer: Number(metrics.recommendedBufferBps),
        timestamp: Number(metrics.timestamp)
      };
    } catch (error) {
      console.error(`[RiskManager] WARNING: Failed to fetch ZK Risk metrics: ${error.message}. Defaulting to LOW risk.`);
      return {
        level: 'LOW',
        drawdownBps: 0,
        sharpe: 0,
        recommendedBuffer: 500,
        timestamp: Math.floor(Date.now() / 1000)
      };
    }
  }

  async evaluateSafetyAction(currentProfile) {
    if (currentProfile.level === 'HIGH') {
      return {
        action: 'PAUSE_AND_PROTECT',
        reason: `High risk detected: ${currentProfile.drawdownBps} bps drawdown proven by ZK.`
      };
    }
    
    if (currentProfile.level === 'MEDIUM') {
      return {
        action: 'REBALANCE_TO_GOLD',
        reason: `Medium risk detected: ${currentProfile.drawdownBps} bps drawdown. Pivoting to XAU₮.`
      };
    }

    return { action: 'NONE', reason: 'Risk levels within normal bounds.' };
  }

  async triggerEmergencyPause(reason) {
    console.log(`!!! EMERGENCY PAUSE TRIGGERED !!!`);
    console.log(`Reason: ${reason}`);

    const bnbAccount = await this.wdk.getAccount('bnb');
    
    // In a real scenario, the agent would have a 'PAUSER' role
    // We encode the 'pause()' call for CircuitBreaker
    const data = '0x8456d592'; // bytes4(keccak256("pause()"))
    
    const tx = await bnbAccount.sendTransaction({
      to: await this.breaker.getAddress(),
      value: 0n,
      data: data
    });

    console.log(`Vault Paused! Hash: ${tx.hash}`);
    return tx;
  }
}
