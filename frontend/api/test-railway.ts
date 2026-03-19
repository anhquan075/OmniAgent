// Vercel serverless function — auto-detected from api/ directory
export const config = {
  api: {
    bodyParser: true,
    responseLimit: false,
  },
};

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://omniagent-production.up.railway.app';

export default async function handler(req: any, res: any) {
  try {
    const response = await fetch(`${RAILWAY_URL}/api/stats`, {
      headers: {
        Origin: 'https://omni-wdk.vercel.app',
      },
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json();
    res.json({ ok: true, fromRailway: data });
  } catch (err: any) {
    res.json({ ok: false, error: err.message });
  }
}
