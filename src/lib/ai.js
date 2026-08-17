/**
 * Copyright 2025-2026 Blackout Secure
 * SPDX-License-Identifier: Apache-2.0
 *
 * Optional AI findings summary with a deterministic local fallback.
 *
 * Provider selection is credential-driven: GitHub Models is used when a
 * token is exposed to the job, any other provider requires both an
 * explicit name and an endpoint. Any transport or authorization failure
 * is treated as ordinary unavailability so the run never fails due to AI.
 */

const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const GITHUB_PROVIDER_ALIASES = ['auto', 'github', 'github-models', 'copilot'];
const DISABLED_ALIASES = ['none', 'disabled', 'false', 'off'];

function httpsEndpoint(value) {
  const endpoint = String(value || '').trim();
  return endpoint.startsWith('https://') ? endpoint : '';
}

/**
 * Select an AI provider from configuration and the ambient environment.
 * @param {string} [configured] - Configured provider name.
 * @param {object} [environ] - Environment map (defaults to `process.env`).
 * @returns {object|null} Provider descriptor, or null when unavailable.
 */
function detectProvider(configured = '', environ = process.env) {
  const env = environ || {};
  const name = String(configured || 'auto')
    .trim()
    .toLowerCase();

  if (DISABLED_ALIASES.includes(name)) return null;

  if (GITHUB_PROVIDER_ALIASES.includes(name)) {
    const token = env.GITHUB_MODELS_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN;
    const endpoint = httpsEndpoint(env.GITHUB_MODELS_ENDPOINT || GITHUB_MODELS_ENDPOINT);
    if (token && endpoint) {
      return {
        name: 'github-models',
        endpoint,
        model:
          env.GITHUB_MODELS_MODEL_HUMANS_TXT || env.GITHUB_MODELS_MODEL || 'openai/gpt-4o-mini',
        token,
      };
    }
    return null;
  }

  const prefix = name.toUpperCase().replace(/-/g, '_');
  const token = env[`${prefix}_API_KEY`] || env.AI_API_KEY;
  const endpoint = httpsEndpoint(env[`${prefix}_API_ENDPOINT`] || env.AI_API_ENDPOINT);
  if (token && endpoint) {
    return { name, endpoint, model: env[`${prefix}_MODEL`] || '', token };
  }
  return null;
}

/**
 * Send a chat completion request, treating every failure as unavailability.
 * @param {object} provider - Provider descriptor from `detectProvider`.
 * @param {Array<object>} messages - Chat messages.
 * @param {object} [options] - Request options.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds.
 * @param {number} [options.maxTokens] - Response token cap.
 * @param {number} [options.temperature] - Sampling temperature.
 * @returns {Promise<string|null>} Message content, or null when unavailable.
 */
async function chat(provider, messages, options = {}) {
  const { timeoutMs = 20000, maxTokens = 300, temperature = 0 } = options;
  if (!provider) return null;

  const payload = {
    model: provider.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Request a short natural-language summary of the findings.
 * @param {Array<object>} findings - Serialisable finding payloads.
 * @param {object} provider - Provider descriptor from `detectProvider`.
 * @param {object} [options] - Request options.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds.
 * @returns {Promise<string|null>} Summary text, or null when unavailable.
 */
async function summarize(findings, provider, options = {}) {
  const { timeoutMs = 20000 } = options;
  if (!provider) return null;

  return chat(
    provider,
    [
      { role: 'system', content: 'You are a site-metadata hygiene triage assistant.' },
      {
        role: 'user',
        content:
          'Summarize these humans.txt audit findings in at most three concise bullets. ' +
          'Prioritize severity and concrete next steps. Do not invent facts.\n\n' +
          JSON.stringify(findings),
      },
    ],
    { timeoutMs, maxTokens: 300 },
  );
}

/**
 * Deterministic summary used when no AI provider is available.
 * @param {object} result - An `AuditResult`.
 * @returns {string} A short, factual summary.
 */
function localSummary(result) {
  const totals = result.totals();
  const lines = [
    `- ${totals.fail} high, ${totals.warn} warning, ${totals.error} critical, ` +
      `${totals.pass} passing, ${totals.skip} not assessed.`,
  ];

  const attention = [...result.errored, ...result.failed, ...result.warned];
  if (!attention.length) {
    lines.push('- No humans.txt control requires attention in this run.');
    return lines.join('\n');
  }

  for (const finding of attention.slice(0, 2)) {
    lines.push(`- ${finding.ruleId} (${finding.title}): ${finding.remediation}`);
  }
  if (attention.length > 2) {
    lines.push(`- ${attention.length - 2} further finding(s) are listed in the full report.`);
  }
  return lines.join('\n');
}

/**
 * Produce a findings summary, preferring AI and falling back to local text.
 * @param {object} result - An `AuditResult`.
 * @param {object} remediation - Resolved `humans_txt.remediation` config.
 * @param {object} [options] - Overrides.
 * @param {object} [options.environ] - Environment map.
 * @param {number} [options.timeoutMs] - Request timeout in milliseconds.
 * @returns {Promise<object>} `{ text, provider }`; `text` may be empty.
 */
async function buildSummary(result, remediation, options = {}) {
  const { environ = process.env, timeoutMs = 20000 } = options;

  if (!remediation.enableAiFindingsSummary) {
    return remediation.localHeuristicFallback
      ? { text: localSummary(result), provider: 'local-heuristic' }
      : { text: '', provider: 'disabled' };
  }

  const provider = detectProvider(remediation.aiFindingsSummaryProvider, environ);
  if (provider) {
    const payload = result.findings
      .filter((f) => f.severity !== 'pass')
      .map((f) => ({
        rule_id: f.ruleId,
        severity: f.severity,
        title: f.title,
        message: f.message,
      }));
    const text = await summarize(payload, provider, { timeoutMs });
    if (text) return { text, provider: provider.name };
  }

  return remediation.localHeuristicFallback
    ? { text: localSummary(result), provider: 'local-heuristic' }
    : { text: '', provider: 'unavailable' };
}

module.exports = {
  GITHUB_MODELS_ENDPOINT,
  detectProvider,
  chat,
  summarize,
  localSummary,
  buildSummary,
};
