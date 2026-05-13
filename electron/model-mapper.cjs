/**
 * model-mapper.cjs — Bidirectional model name mapping for proxy protocol translation.
 *
 * Maps between OpenAI model names, Anthropic model names, and Kiro internal model names.
 * Supports exact match, reverse mapping, and fuzzy fallback for unknown model names.
 *
 * Interface contract (per proxy-shared.cjs):
 *   export: { mapModel(name, from, to), listModels(protocol, kiroModels), KIRO_MODELS }
 */

'use strict';

// ─── Known Kiro model names ─────────────────────────────────────────────────
const KIRO_MODELS = [
  'Auto',
  'Claude Opus 4.7',
  'Claude Opus 4.6',
  'Claude Opus 4.5',
  'Claude Sonnet 4.6',
  'Claude Sonnet 4.5',
  'Claude Sonnet 4.0',
  'Claude Haiku 4.5',
  'DeepSeek 3.2',
  'MiniMax M2.5',
  'GLM-5',
  'MiniMax M2.1',
  'Qwen3 Coder Next'
];

// ─── Exact mapping tables ────────────────────────────────────────────────────

// OpenAI → Kiro
const OPENAI_TO_KIRO = {
  'gpt-4o':          'Auto',
  'gpt-4o-mini':     'Claude Haiku 4.5',
  'gpt-4-turbo':     'Claude Opus 4.7'
};

// Anthropic → Kiro
const ANTHROPIC_TO_KIRO = {
  'claude-sonnet-4-20250514':  'Claude Sonnet 4.6',
  'claude-opus-4-20250514':    'Claude Opus 4.7',
  'claude-haiku-3-5-20241022': 'Claude Haiku 4.5'
};

// ─── Build reverse mapping tables ────────────────────────────────────────────

// Kiro → OpenAI
const KIRO_TO_OPENAI = {};
for (const [openaiName, kiroName] of Object.entries(OPENAI_TO_KIRO)) {
  KIRO_TO_OPENAI[kiroName] = openaiName;
}
// 'Auto' explicitly maps to 'gpt-4o'
KIRO_TO_OPENAI['Auto'] = 'gpt-4o';
// Additional Kiro → OpenAI mappings for Claude variants not in the exact table
KIRO_TO_OPENAI['Claude Sonnet 4.6'] = 'gpt-4o';
KIRO_TO_OPENAI['Claude Sonnet 4.5'] = 'gpt-4o';
KIRO_TO_OPENAI['Claude Sonnet 4.0'] = 'gpt-4o';
KIRO_TO_OPENAI['Claude Opus 4.6'] = 'gpt-4-turbo';
KIRO_TO_OPENAI['Claude Opus 4.5'] = 'gpt-4-turbo';
KIRO_TO_OPENAI['DeepSeek 3.2'] = 'deepseek-chat';

// Kiro → Anthropic
const KIRO_TO_ANTHROPIC = {};
for (const [anthropicName, kiroName] of Object.entries(ANTHROPIC_TO_KIRO)) {
  KIRO_TO_ANTHROPIC[kiroName] = anthropicName;
}
// Additional Kiro → Anthropic mappings for Claude variants not in the exact table
KIRO_TO_ANTHROPIC['Auto'] = 'claude-sonnet-4-20250514';
KIRO_TO_ANTHROPIC['Claude Sonnet 4.5'] = 'claude-sonnet-4-20250514';
KIRO_TO_ANTHROPIC['Claude Sonnet 4.0'] = 'claude-sonnet-4-20250514';
KIRO_TO_ANTHROPIC['Claude Opus 4.6'] = 'claude-opus-4-20250514';
KIRO_TO_ANTHROPIC['Claude Opus 4.5'] = 'claude-opus-4-20250514';

// ─── Fuzzy matching helpers ──────────────────────────────────────────────────

/**
 * Fuzzy match an unknown OpenAI model name to the best Kiro model.
 * Rules:
 *   "gpt-4" / "gpt-4o" → best Claude model (Claude Sonnet 4.6)
 *   "gpt-3.5"         → cheapest available (Claude Haiku 4.5)
 *   "deepseek"        → Kiro's DeepSeek model
 *   "claude"          → closest Claude by version number
 *   "*" / default     → "Auto"
 */
function fuzzyOpenAIToKiro(name) {
  const lower = name.toLowerCase();

  if (lower.includes('gpt-4o') || lower.includes('gpt-4')) {
    return 'Claude Sonnet 4.6';
  }
  if (lower.includes('gpt-3.5')) {
    return 'Claude Haiku 4.5';
  }
  if (lower.includes('deepseek')) {
    return 'DeepSeek 3.2';
  }
  if (lower.includes('claude')) {
    return fuzzyClaudeToKiro(name);
  }

  return 'Auto';
}

/**
 * Fuzzy match an unknown Anthropic model name to the best Kiro model.
 */
function fuzzyAnthropicToKiro(name) {
  const lower = name.toLowerCase();

  if (lower.includes('claude')) {
    return fuzzyClaudeToKiro(name);
  }
  if (lower.includes('deepseek')) {
    return 'DeepSeek 3.2';
  }

  return 'Auto';
}

/**
 * Fuzzy match a Claude-family model name to the best Kiro Claude model.
 * Inspects model variant (opus/sonnet/haiku) and version numbers.
 */
function fuzzyClaudeToKiro(name) {
  const lower = name.toLowerCase();

  // Claude Opus variants
  if (lower.includes('opus')) {
    if (lower.includes('4.7') || lower.includes('20250514')) return 'Claude Opus 4.7';
    if (lower.includes('4.6')) return 'Claude Opus 4.6';
    if (lower.includes('4.5')) return 'Claude Opus 4.5';
    return 'Claude Opus 4.7';
  }

  // Claude Sonnet variants
  if (lower.includes('sonnet')) {
    if (lower.includes('4.6') || lower.includes('20250514')) return 'Claude Sonnet 4.6';
    if (lower.includes('4.5')) return 'Claude Sonnet 4.5';
    if (lower.includes('4.0')) return 'Claude Sonnet 4.0';
    return 'Claude Sonnet 4.6';
  }

  // Claude Haiku variants
  if (lower.includes('haiku')) {
    return 'Claude Haiku 4.5';
  }

  // Generic Claude — best available
  return 'Claude Sonnet 4.6';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Map a model name from one protocol namespace to another.
 *
 * @param {string} name         - Model name in the source protocol
 * @param {string} fromProtocol - Source protocol: "openai", "anthropic", or "kiro"
 * @param {string} toProtocol   - Target protocol: "openai", "anthropic", or "kiro"
 * @returns {string}            - Model name in the target protocol namespace
 */
function mapModel(name, fromProtocol, toProtocol) {
  if (!name || name === '*') {
    return (toProtocol === 'kiro') ? 'Auto' : (toProtocol === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-20250514');
  }

  // ── OpenAI → Kiro ──
  if (fromProtocol === 'openai' && toProtocol === 'kiro') {
    if (OPENAI_TO_KIRO.hasOwnProperty(name)) return OPENAI_TO_KIRO[name];
    return fuzzyOpenAIToKiro(name);
  }

  // ── Anthropic → Kiro ──
  if (fromProtocol === 'anthropic' && toProtocol === 'kiro') {
    if (ANTHROPIC_TO_KIRO.hasOwnProperty(name)) return ANTHROPIC_TO_KIRO[name];
    return fuzzyAnthropicToKiro(name);
  }

  // ── Kiro → OpenAI ──
  if (fromProtocol === 'kiro' && toProtocol === 'openai') {
    if (KIRO_TO_OPENAI.hasOwnProperty(name)) return KIRO_TO_OPENAI[name];
    // Unknown Kiro model: generate a clean OpenAI-style id
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  // ── Kiro → Anthropic ──
  if (fromProtocol === 'kiro' && toProtocol === 'anthropic') {
    if (KIRO_TO_ANTHROPIC.hasOwnProperty(name)) return KIRO_TO_ANTHROPIC[name];
    // Unknown Kiro model: generate a clean Anthropic-style id
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  // ── Same protocol (no-op) or unknown combination ──
  return name;
}

/**
 * List available models formatted for the given protocol.
 *
 * @param {string}   protocol   - Target protocol: "openai", "anthropic", or "kiro"
 * @param {string[]} [kiroModels] - Array of Kiro model names. Defaults to KIRO_MODELS.
 * @returns {object}            - Protocol-specific model list response body
 */
function listModels(protocol, kiroModels) {
  const models = kiroModels || KIRO_MODELS;
  const now = new Date().toISOString();
  const timestamp = Math.floor(Date.now() / 1000);

  if (protocol === 'openai') {
    return {
      object: 'list',
      data: models.map(function (m) {
        return {
          id: mapModel(m, 'kiro', 'openai'),
          object: 'model',
          created: timestamp,
          owned_by: 'kiro'
        };
      })
    };
  }

  if (protocol === 'anthropic') {
    return {
      data: models.map(function (m) {
        return {
          id: mapModel(m, 'kiro', 'anthropic'),
          display_name: m,
          created_at: now,
          type: 'model'
        };
      })
    };
  }

  // Raw Kiro format
  return { object: 'list', data: models };
}

module.exports = {
  KIRO_MODELS,
  mapModel,
  listModels
};
