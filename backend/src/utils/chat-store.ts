import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import path from 'path';

export async function createChat(id: string): Promise<string> {
  await writeFile(getChatFile(id), '[]'); 
  return id;
}

export function getChatFile(id: string): string {
  const chatDir = path.join(process.cwd(), '.chats');
  if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true });
  return path.join(chatDir, `${id}.json`);
}

export async function loadChat(id: string): Promise<any[]> {
  try {
    const file = getChatFile(id);
    if (!existsSync(file)) return [];
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    console.error(`Error loading chat ${id}:`, error);
    return [];
  }
}

export async function saveChat({
  chatId,
  messages,
}: {
  chatId: string;
  messages: any[];
}): Promise<void> {
  try {
    const content = JSON.stringify(messages, null, 2);
    await writeFile(getChatFile(chatId), content);
  } catch (error) {
    console.error(`Error saving chat ${chatId}:`, error);
  }
}

export async function listChats(): Promise<string[]> {
  try {
    const chatDir = path.join(process.cwd(), '.chats');
    if (!existsSync(chatDir)) return [];
    const files = await readdir(chatDir);
    return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  } catch (error) {
    console.error('Error listing chats:', error);
    return [];
  }
}
