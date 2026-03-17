"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const env_1 = require("./env");
const logger_1 = require("@/utils/logger");
const PLACEHOLDER_VALUES = [
    'replace_me',
    'your_',
    'xxx',
    '0x0',
    'undefined',
    'null',
];
function isPlaceholder(value) {
    if (!value || value.trim().length === 0)
        return true;
    const normalized = value.toLowerCase().trim();
    return PLACEHOLDER_VALUES.some(placeholder => normalized.includes(placeholder));
}
function validateSecretSeed() {
    const seed = env_1.env.WDK_SECRET_SEED;
    if (!seed) {
        throw new Error('WDK_SECRET_SEED is not set in environment variables');
    }
    if (isPlaceholder(seed)) {
        throw new Error(`WDK_SECRET_SEED appears to be a placeholder value. ` +
            `Please set a valid BIP-39 mnemonic or hex seed in your environment.`);
    }
    if (seed.split(' ').length < 12 && !seed.startsWith('0x')) {
        throw new Error(`WDK_SECRET_SEED appears invalid: expected BIP-39 mnemonic (12+ words) or hex string starting with 0x. ` +
            `Got: ${seed.length} characters`);
    }
}
function validateContractAddresses() {
    const addresses = [
        { name: 'WDK_VAULT_ADDRESS', value: env_1.env.WDK_VAULT_ADDRESS },
        { name: 'WDK_ENGINE_ADDRESS', value: env_1.env.WDK_ENGINE_ADDRESS },
        { name: 'WDK_ZK_ORACLE_ADDRESS', value: env_1.env.WDK_ZK_ORACLE_ADDRESS },
        { name: 'WDK_BREAKER_ADDRESS', value: env_1.env.WDK_BREAKER_ADDRESS },
        { name: 'WDK_USDT_ADDRESS', value: env_1.env.WDK_USDT_ADDRESS },
    ];
    for (const { name, value } of addresses) {
        if (!value || !value.startsWith('0x') || value.length !== 42) {
            throw new Error(`${name} is missing or invalid. Expected valid Ethereum address (0x...)`);
        }
    }
}
function validateEnvironment() {
    logger_1.logger.info('[Security] Validating critical environment variables');
    validateSecretSeed();
    logger_1.logger.debug('WDK_SECRET_SEED is valid');
    validateContractAddresses();
    logger_1.logger.debug('Contract addresses are valid');
    if (!env_1.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is not set. Agent requires LLM access.');
    }
    logger_1.logger.debug('OPENROUTER_API_KEY is configured');
    logger_1.logger.info('[Security] All environment validations passed');
}
