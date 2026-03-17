import { handleWdkTool } from '../src/mcp-server/handlers/wdk-tools';
import { McpExecutionContext } from '../src/mcp-server/types/mcp-protocol';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../src/utils/logger';

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

dotenv.config({ path: '.env', override: true });

async function testTool(name: string, params: Record<string, unknown>, context: McpExecutionContext) {
  logger.info(`\nTesting tool: ${name}`);
  try {
    const result = await handleWdkTool(name, params, context);
    if (result.success) {
      logger.info(`  ✓ Success: ${JSON.stringify(result.data)}`);
      return true;
    } else {
      logger.error(`  ✗ Failed: ${JSON.stringify(result.error)}`);
      return false;
    }
  } catch (error) {
    logger.error(`  ✗ Exception: ${error}`);
    return false;
  }
}

async function main() {
  logger.info("Starting MCP Tools Smoke Test...");

  const context: McpExecutionContext = {
    requestId: "test-123",
    sessionId: "test-session",
    agentId: "test-agent",
    traceId: "test-trace",
    user: { id: "test-user" },
    tool: { name: "test", version: "1.0.0" },
  };

  // Get the agent address for testing
  const agentAddress = "0xA4c009f0541d9C7f86F12cF4470Faf60448B240B"; // From previous smoke test
  
  await testTool('wdk_vault_getBalance', { account: agentAddress }, context);
  await testTool('wdk_vault_getState', {}, context);
  await testTool('wdk_engine_getCycleState', {}, context);
  await testTool('wdk_engine_getRiskMetrics', {}, context);
  await testTool('wdk_aave_getPosition', { user: agentAddress }, context);
  await testTool('wdk_bridge_getStatus', { amount: "100", dstEid: 1 }, context);

  logger.info("\nMCP Tools Smoke Test Completed.");
}

main().catch((err) => {
  logger.error(err, '[MCPSmokeTest] Smoke Test Failed');
  process.exit(1);
});
