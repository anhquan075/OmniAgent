import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://omniagent-production.up.railway.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = `${RAILWAY_URL}/api/robot-fleet/events`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        Origin: 'https://omni-wdk.vercel.app',
      },
    });

    if (!response.ok) {
      res.statusCode = response.status;
      res.end(`data: ${JSON.stringify({ error: 'Upstream error' })}\n\n`);
      return;
    }

    if (!response.body) {
      res.end(`data: ${JSON.stringify({ error: 'No body' })}\n\n`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
        if ((req as any).socket?.destroyed) break;
      }
    } finally {
      reader.releaseLock();
    }
  } catch (err: any) {
    if ((req as any).socket?.destroyed) return;
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.end();
}
