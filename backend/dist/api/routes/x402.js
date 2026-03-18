"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hono_1 = require("hono");
const logger_1 = require("../../utils/logger");
const x402 = new hono_1.Hono();
x402.get('/risk-analysis', async (c) => {
    logger_1.logger.info('[X402] Received request for risk-analysis');
    const paymentHash = c.req.header('X-402-Payment-Hash');
    logger_1.logger.debug({ paymentHash }, '[X402] Payment header');
    if (!paymentHash) {
        logger_1.logger.warn('[X402] No payment hash provided, returning 402');
        return c.json({ error: 'Payment Required', code: 402, message: 'Please provide X-402-Payment-Hash header' }, 402);
    }
    // In a real scenario, we would verify the transaction hash on-chain
    // to ensure 0.1 USDT was actually transferred to the provider address.
    logger_1.logger.info('[X402] Returning MEDIUM_RISK signal');
    return c.json({
        signal: 'MEDIUM_RISK',
        confidence: 0.85,
        details: 'Advanced off-chain analysis indicates moderate volatility in the next 24 hours. Consider increasing buffer targets.'
    });
});
exports.default = x402;
