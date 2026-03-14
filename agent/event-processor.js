import crypto from 'crypto';
import { runCycle } from './loop.js';

export class EventProcessor {
  constructor(secret) {
    this.secret = secret;
  }

  /**
   * Verifies the GitHub HMAC signature.
   */
  verifySignature(payload, signature) {
    if (!this.secret) {
      console.error('WARNING: GITHUB_WEBHOOK_SECRET is not set. Accepting webhook without validation.');
      return true; // Fallback for dev/testing if no secret is set
    }
    
    if (!signature) {
      console.error('No signature provided in webhook.');
      return false;
    }
    
    const hmac = crypto.createHmac('sha256', this.secret);
    // GitHub uses sha256= prefix
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch (e) {
      return false;
    }
  }

  /**
   * Processes the parsed event and triggers actions if conditions are met.
   */
  async processEvent(eventName, rawBody, parsedPayload) {
    console.error(`[EventProcessor] Processing event: ${eventName}`);
    
    let shouldRebalance = false;
    
    if (eventName === 'pull_request') {
      const pr = parsedPayload.pull_request;
      if (pr && pr.state === 'closed' && pr.merged) {
        console.error('[EventProcessor] Pull request merged! Triggering rebalance/reward distribution.');
        shouldRebalance = true;
      }
    } else if (eventName === 'issues') {
      const issue = parsedPayload.issue;
      if (issue && issue.state === 'closed') {
        console.error('[EventProcessor] Issue closed! Triggering rebalance.');
        shouldRebalance = true;
      }
    } else if (eventName === 'push') {
      // Just an example of another trigger
      console.error('[EventProcessor] Code pushed. Triggering rebalance.');
      shouldRebalance = true;
    }

    if (shouldRebalance) {
      try {
        console.error('[EventProcessor] Initiating event-driven autonomous cycle...');
        // We trigger the autonomous loop. In the future we can pass event data to it.
        const result = await runCycle();
        return { success: true, message: 'Event triggered rebalance successfully', result };
      } catch (error) {
        console.error('[EventProcessor] Failed to execute event-driven cycle:', error);
        return { success: false, error: error.message };
      }
    }
    
    return { success: true, message: 'Event ignored based on policy' };
  }
}
