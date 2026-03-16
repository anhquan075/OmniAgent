"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeJsonParse = exports.bigIntReplacer = void 0;
/**
 * JSON.stringify replacer to handle BigInt values by converting them to strings.
 */
const bigIntReplacer = (_key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
};
exports.bigIntReplacer = bigIntReplacer;
/**
 * Safely parse JSON or return default value
 */
const safeJsonParse = (json, fallback) => {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
};
exports.safeJsonParse = safeJsonParse;
