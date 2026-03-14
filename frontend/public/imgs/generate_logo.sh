#!/bin/bash
# Run this script to generate the WDKVault logo

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY environment variable is not set."
  echo "Please set it before running this script:"
  echo "export GEMINI_API_KEY='your-key-here'"
  exit 1
fi

python3 /Users/quannguyen/.gemini/skills/ai-artist/scripts/generate.py \
  "A sleek, modern, cybernetic logo icon for 'WDKVault', an autonomous DeFi AI agent. The design should feature a secure vault or glowing central core, integrating a futuristic 'W' or 'V' shape. The primary color must be a glowing 'Tether Teal' (cyan-green #26A17B) with accents of 'XAU₮ Gold' (#D4AF37) set against a very dark, space-black background. Minimalist, tech-forward, sharp edges, neon glowing effects, high quality, suitable for a web app favicon and logo." \
  -o frontend/public/imgs/logo.png \
  -ar 1:1
