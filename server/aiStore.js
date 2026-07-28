import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const DIR = path.join(os.homedir(), '.dbsurfer');
const FILE = path.join(DIR, 'ai.json');

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    state = { keys: [], activeKeyId: null };
  }
  if (!Array.isArray(state.keys)) state.keys = [];
  return state;
}

function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function publicKey(k) {
  return {
    id: k.id,
    provider: k.provider,
    model: k.model,
    label: k.label || '',
    keyPreview: `••••${k.apiKey.slice(-4)}`,
    createdAt: k.createdAt,
  };
}

export function getAiConfig() {
  const s = load();
  return { keys: s.keys.map(publicKey), activeKeyId: s.activeKeyId };
}

export function addAiKey({ provider, apiKey, model, label }) {
  const s = load();
  const key = {
    id: crypto.randomUUID(),
    provider,
    apiKey,
    model,
    label: label || '',
    createdAt: new Date().toISOString(),
  };
  s.keys.push(key);
  if (!s.activeKeyId) s.activeKeyId = key.id;
  save();
  return publicKey(key);
}

export function deleteAiKey(id) {
  const s = load();
  s.keys = s.keys.filter((k) => k.id !== id);
  if (s.activeKeyId === id) s.activeKeyId = s.keys[0]?.id ?? null;
  save();
}

export function setActiveAiKey(id) {
  const s = load();
  if (id !== null && !s.keys.some((k) => k.id === id)) {
    throw new Error('Unknown key id');
  }
  s.activeKeyId = id;
  save();
}

export function updateAiKey(id, { model, label }) {
  const s = load();
  const key = s.keys.find((k) => k.id === id);
  if (!key) throw new Error('Unknown key id');
  if (model !== undefined) key.model = model;
  if (label !== undefined) key.label = label;
  save();
  return publicKey(key);
}

// Internal use only: returns the full key including the secret.
export function getActiveAiKey() {
  const s = load();
  return s.keys.find((k) => k.id === s.activeKeyId) || null;
}

export function getAiKeyById(id) {
  const s = load();
  return s.keys.find((k) => k.id === id) || null;
}
