"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_SERVER_URL = exports.OPENROUTER_DEFAULT_URL = exports.COINGECKO_API_URL = exports.ZERO_ADDRESS = exports.PAUSE_SELECTOR = exports.MEDIUM_RISK_DRAWDOWN_BPS = exports.HIGH_RISK_DRAWDOWN_BPS = void 0;
const env_1 = require("../config/env");
exports.HIGH_RISK_DRAWDOWN_BPS = 2000;
exports.MEDIUM_RISK_DRAWDOWN_BPS = 1000;
exports.PAUSE_SELECTOR = '0x8456d592';
exports.ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
exports.COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
exports.OPENROUTER_DEFAULT_URL = 'https://openrouter.ai/api/v1';
function getServerBaseUrl() {
    if (env_1.env.AGENT_REPORT_BASE_URL) {
        return env_1.env.AGENT_REPORT_BASE_URL;
    }
    return `http://localhost:${env_1.env.PORT}`;
}
exports.LOCAL_SERVER_URL = `${getServerBaseUrl()}/api/agent/report`;
