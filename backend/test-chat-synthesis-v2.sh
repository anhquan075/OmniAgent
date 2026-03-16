#!/bin/bash

echo "=============================================="
echo "Chat Synthesis Test with Model Routing"
echo "=============================================="
echo ""

TEST_QUERIES=(
  "Hello, how are you?"
  "What is the current vault status?"
  "Analyze risk for the current strategy"
)

for query in "${TEST_QUERIES[@]}"; do
  echo "Query: '$query'"
  echo "---"
  
  response=$(curl -s -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d "{\"messages\": [{\"role\": \"user\", \"content\": \"$query\"}], \"id\": \"test-$(date +%s)\"}")
  
  # Check for text-delta in response
  has_text=$(echo "$response" | grep -c "text-delta" || true)
  has_tool=$(echo "$response" | grep -c "tool-call" || true)
  has_finish=$(echo "$response" | grep -c "finish" || true)
  
  echo "Response analysis:"
  echo "  - Has text-delta: $has_text"
  echo "  - Has tool-call: $has_tool"
  echo "  - Has finish: $has_finish"
  
  # Show first text response if available
  if [ "$has_text" -gt 0 ]; then
    echo "  - First text chunk:"
    echo "$response" | grep "text-delta" | head -1 | jq -r '.data.delta' 2>/dev/null || echo "    (parsing failed)"
  else
    echo "  - ❌ NO TEXT RESPONSE GENERATED"
  fi
  
  echo ""
done

echo "=============================================="
echo "Checking backend logs for model selection..."
tail -30 /tmp/backend-server.log | grep "Chat\]"
echo "=============================================="
