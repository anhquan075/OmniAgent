"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChat = createChat;
exports.loadChat = loadChat;
exports.saveChat = saveChat;
exports.listChats = listChats;
const store = new Map();
async function createChat(id) {
    store.set(id, []);
    return id;
}
async function loadChat(id) {
    return store.get(id) ?? [];
}
async function saveChat({ chatId, messages, }) {
    store.set(chatId, messages);
}
async function listChats() {
    return Array.from(store.keys());
}
