'use strict';
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'assessment-config';
const CONFIG_KEY = 'site-config';

async function getConfig(context) {
  try {
    const store = getStore({ name: STORE_NAME, context });
    return await store.get(CONFIG_KEY, { type: 'json' });
  } catch (_) { return null; }
}

async function saveConfig(cfg, context) {
  const store = getStore({ name: STORE_NAME, context });
  await store.setJSON(CONFIG_KEY, cfg);
}

module.exports = { getConfig, saveConfig };
