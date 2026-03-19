import { Hono } from 'hono';
import { getToolsMetadata } from '@/agent/tools';

const tools = new Hono();

tools.get('/', (c) => {
  const metadata = getToolsMetadata();
  return c.json({ tools: metadata });
});

export default tools;
