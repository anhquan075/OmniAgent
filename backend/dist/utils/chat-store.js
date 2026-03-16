"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChat = createChat;
exports.getChatFile = getChatFile;
exports.loadChat = loadChat;
exports.saveChat = saveChat;
exports.listChats = listChats;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
async function createChat(id) {
    await (0, promises_1.writeFile)(getChatFile(id), '[]');
    return id;
}
function getChatFile(id) {
    const chatDir = path_1.default.join(process.cwd(), '.chats');
    if (!(0, fs_1.existsSync)(chatDir))
        (0, fs_1.mkdirSync)(chatDir, { recursive: true });
    return path_1.default.join(chatDir, `${id}.json`);
}
async function loadChat(id) {
    try {
        const file = getChatFile(id);
        if (!(0, fs_1.existsSync)(file))
            return [];
        return JSON.parse(await (0, promises_1.readFile)(file, 'utf8'));
    }
    catch (error) {
        console.error(`Error loading chat ${id}:`, error);
        return [];
    }
}
async function saveChat({ chatId, messages, }) {
    try {
        const content = JSON.stringify(messages, null, 2);
        await (0, promises_1.writeFile)(getChatFile(chatId), content);
    }
    catch (error) {
        console.error(`Error saving chat ${chatId}:`, error);
    }
}
async function listChats() {
    try {
        const chatDir = path_1.default.join(process.cwd(), '.chats');
        if (!(0, fs_1.existsSync)(chatDir))
            return [];
        const files = await (0, promises_1.readdir)(chatDir);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    }
    catch (error) {
        console.error('Error listing chats:', error);
        return [];
    }
}
