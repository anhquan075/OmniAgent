export function clearWagmiCache() {
  // Clear wagmi cache from localStorage
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.includes('wagmi') || key.includes('wallet')) {
      localStorage.removeItem(key);
    }
  });
}
