# Cloudflare CI/CD Setup

## Step 1: Get Cloudflare Credentials

### 1.1 Get Account ID
1. Go to https://dash.cloudflare.com
2. Click on your profile → Overview
3. Copy your **Account ID**

### 1.2 Create API Token
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template
4. Or create custom token with:
   - `Workers:Edit`
   - `Pages:Edit`
5. Copy the generated token

## Step 2: Add Secrets to GitHub

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add new repository secrets:

### `CLOUDFLARE_API_TOKEN`
```
Your API token from step 1.2
```

### `CLOUDFLARE_ACCOUNT_ID`
```
Your Account ID from step 1.1
```

## Step 3: Update wrangler.toml

Make sure `wrangler.toml` has:
```toml
name = "omni-agent"
compatibility_date = "2024-01-01"

[vars]
NODE_VERSION = "18"
```

## Step 4: Push and Deploy

```bash
git add .
git commit -m "Add Cloudflare CI/CD"
git push origin main
```

The workflow will:
1. Install dependencies
2. Run TypeScript build
3. Deploy to Cloudflare Pages

## Step 5: Set Environment Variables

After first deploy, go to Cloudflare Dashboard:
1. Pages → omni-agent → Settings → Environment Variables
2. Add:
   - `JWT_SECRET` = your 64-char secret
   - `WDK_SECRET_SEED` = your wallet seed
   - `OPENROUTER_API_KEY` = your API key
   - `BNB_RPC_URL` = your RPC URL

## API Endpoints

After deployment:
```
https://omni-agent.pages.dev/health
https://omni-agent.pages.dev/api/stats
https://omni-agent.pages.dev/api/chat
```

## Troubleshooting

If deployment fails:
1. Check GitHub Actions logs
2. Verify secrets are correct
3. Make sure wrangler can log in locally first
