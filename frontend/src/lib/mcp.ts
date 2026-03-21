export const callMcpTool = async (userAddress: string, toolName: string, params: object) => {
  try {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'x-user-wallet': userAddress, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: params } })
    });
    
    const json = await res.json();
    
    if (json.error) {
      throw new Error(json.error.message || 'MCP execution failed');
    }

    if (json.result?.content?.[0]?.text) {
      const parsed = JSON.parse(json.result.content[0].text);
      return { result: parsed };
    }

    return json;
  } catch (error) {
    console.error(`MCP Tool Error (${toolName}):`, error);
    throw error;
  }
};
