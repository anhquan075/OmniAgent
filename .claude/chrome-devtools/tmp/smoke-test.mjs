import { getBrowser, getPage, disconnectBrowser, outputJSON } from '/Users/quannguyen/.gemini/skills/chrome-devtools/scripts/lib/browser.js';

async function smokeTest() {
  const browser = await getBrowser();
  const page = await getPage(browser);

  try {
    console.error("Navigating to http://localhost:5173...");
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
    
    // Wait for the initial message to be rendered
    console.error("Waiting for initial message...");
    await page.waitForFunction(
      () => document.body.innerText.includes('System initialized'),
      { timeout: 30000 }
    );

    // Find the textarea
    console.error("Locating textarea...");
    const textarea = await page.waitForSelector('textarea', { timeout: 10000 });
    
    // Type a message
    const testMessage = "What is the current risk profile?";
    console.error(`Typing message: ${testMessage}`);
    await textarea.type(testMessage);
    
    // Click send button
    console.error("Clicking send...");
    const sendButton = await page.waitForSelector('button[aria-label="Send message"]', { timeout: 10000 });
    await sendButton.click();

    // Wait for agent to start responding
    console.error("Waiting for agent response...");
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('Risk analyzed') || text.includes('Strategy checked') || text.includes('I detected');
      },
      { timeout: 45000 }
    );

    console.error("Response detected!");
    
    // Wait a bit more for streaming to complete
    await new Promise(r => setTimeout(r, 5000));
    
    // Capture final state
    const screenshotPath = './smoke-test-result.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    outputJSON({
      success: true,
      message: "Smoke test passed: Message sent and agent response detected.",
      screenshot: screenshotPath,
      url: page.url()
    });

  } catch (error) {
    outputJSON({
      success: false,
      error: error.message,
      stack: error.stack
    });
  } finally {
    await disconnectBrowser();
  }
}

smokeTest();
