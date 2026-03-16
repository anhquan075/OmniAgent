const store = new Map<string, any[]>();

export async function createChat(id: string): Promise<string> {
  store.set(id, []);
  return id;
}

export async function loadChat(id: string): Promise<any[]> {
  return store.get(id) ?? [];
}

export async function saveChat({
  chatId,
  messages,
}: {
  chatId: string;
  messages: any[];
}): Promise<void> {
  store.set(chatId, messages);
}

export async function listChats(): Promise<string[]> {
  return Array.from(store.keys());
}
