// Provider adapters for BYOK AI Assist. Uses the global fetch (Node 18+).

export const AI_PROVIDERS = {
  openai: { label: 'OpenAI' },
  anthropic: { label: 'Anthropic' },
  google: { label: 'Google (Gemini)' },
};

export function isValidProvider(provider) {
  return provider in AI_PROVIDERS;
}

async function readError(res) {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return body.error?.message || body.message || text || res.statusText;
  } catch {
    return text || res.statusText;
  }
}

export async function listModels(provider, apiKey) {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    return (body.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(embedding|whisper|tts|audio|image|dall-e|moderation|realtime|transcribe)/.test(id))
      .sort()
      .reverse();
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    return (body.data || []).map((m) => m.id);
  }
  if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(apiKey)}`
    );
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    return (body.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
  }
  throw new Error(`Unknown provider: ${provider}`);
}

function stripFences(text) {
  const match = /```(?:sql|json)?\s*\n?([\s\S]*?)```/.exec(text);
  return (match ? match[1] : text).trim();
}

export async function generateSql({ provider, apiKey, model, system, prompt }) {
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    return stripFences(body.choices?.[0]?.message?.content || '');
  }
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    const text = (body.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return stripFences(text);
  }
  if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    if (!res.ok) throw new Error(await readError(res));
    const body = await res.json();
    const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return stripFences(text);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

const QUERY_LANGUAGE = {
  postgres: 'PostgreSQL SQL',
  mysql: 'MySQL SQL',
  mssql: 'Microsoft SQL Server T-SQL',
  sqlite: 'SQLite SQL',
  mongodb: 'a MongoDB JSON command document (as accepted by db.runCommand, e.g. {"find": ..., "filter": ...} or {"aggregate": ..., "pipeline": [...], "cursor": {}})',
  redis: 'Redis commands, one command per line',
};

export function buildSystemPrompt(dbType, completion) {
  const lang = QUERY_LANGUAGE[dbType] || 'SQL';
  let schemaText = '';
  if (completion && completion.schema) {
    const lines = [];
    for (const [table, cols] of Object.entries(completion.schema)) {
      if (table.includes('.')) continue; // skip duplicate schema-qualified entries
      lines.push(`${table}(${(cols || []).join(', ')})`);
    }
    if (lines.length > 0) schemaText = `\n\nDatabase schema (table(columns)):\n${lines.join('\n')}`;
  }
  return (
    `You are a database query generator inside DBSurfer. Generate ${lang} for the user's request.` +
    ` Respond with ONLY the query - no explanations, no markdown fences, no commentary.` +
    ` Use exact table and column names from the schema (respect case; quote identifiers if needed).` +
    schemaText
  );
}
