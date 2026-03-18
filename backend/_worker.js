"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = void 0;
// Worker entry point for Cloudflare Pages Functions
// Re-export the app from the compiled dist
var index_js_1 = require("../dist/index.js");
Object.defineProperty(exports, "default", { enumerable: true, get: function () { return __importDefault(index_js_1).default; } });
