import fetch from 'node-fetch';

async function testChat() {
  console.log("Sending chat request to agent...");
  try {
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'What is the current status of my vault and what does the AI say about the risk of a rebalance?' }]
      }),
      timeout: 60000 // 60 seconds
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      return;
    }

    const reader = response.body;
    reader.on('data', (chunk) => {
      const line = chunk.toString();
      // Process LangGraph SSE format
      if (line.startsWith('0:')) {
        // Text chunk
        process.stdout.write(JSON.parse(line.substring(2)));
      } else if (line.startsWith('2:')) {
        // Data chunk (status/progress)
        const data = JSON.parse(line.substring(2))[0];
        if (data.type === 'progress') {
          console.log(`\n[PROGRESS] ${data.message}`);
        }
      }
    });

    reader.on('end', () => {
      console.log("\n--- Stream Finished ---");
    });

  } catch (error) {
    console.error("Test failed:", error);
  }
}

testChat();
