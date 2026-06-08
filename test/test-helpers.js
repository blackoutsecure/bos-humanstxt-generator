const fs = require('fs');
const path = require('path');
const { TEST_CONFIG } = require('./test-config');

function setActionInput(key, value) {
  const envName = `INPUT_${key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
  process.env[envName] = String(value);
}

function setupActionEnvironment(eventJsonPath) {
  if (!fs.existsSync(eventJsonPath)) {
    throw new Error(`event.json not found at ${eventJsonPath}`);
  }

  const raw = fs.readFileSync(eventJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  const inputs = parsed?.inputs || {};

  Object.entries(inputs).forEach(([k, v]) => setActionInput(k, v));
  if (!inputs.humans_output_dir) setActionInput('humans_output_dir', TEST_CONFIG.PUBLIC_DIR);
  if (!inputs.humans_filename) setActionInput('humans_filename', TEST_CONFIG.HUMANS_TXT);

  return inputs;
}

function cleanHumans(publicDir = TEST_CONFIG.PUBLIC_DIR) {
  const target = path.join(publicDir, TEST_CONFIG.HUMANS_TXT);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    return [target];
  }
  return [];
}

function runActionLocally(distPath = path.join(__dirname, '..', 'dist', 'index.js')) {
  if (!fs.existsSync(distPath)) {
    throw new Error(`Action entry point not found: ${distPath}. Run 'npm run build' first.`);
  }

  delete require.cache[require.resolve(path.resolve(distPath))];
  const run = require(path.resolve(distPath));
  return run();
}

async function executeActionWithOverrides(publicDir, overrides = {}, waitMs = 100) {
  const eventPath = path.join(__dirname, 'event.json');
  setupActionEnvironment(eventPath);
  Object.entries(overrides).forEach(([k, v]) => setActionInput(k, v));
  setActionInput('humans_output_dir', publicDir);
  await runActionLocally(path.join(__dirname, '..', 'dist', 'index.js'));
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

module.exports = {
  setActionInput,
  setupActionEnvironment,
  cleanHumans,
  runActionLocally,
  executeActionWithOverrides,
};
