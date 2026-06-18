'use strict';
const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'assessment-config';
const CONFIG_KEY = 'site-config';

async function getConfig() {
  try {
    const store = getStore(STORE_NAME);
    return await store.get(CONFIG_KEY, { type: 'json' });
  } catch (_) { return null; }
}

async function saveConfig(cfg) {
  const store = getStore(STORE_NAME);
  await store.setJSON(CONFIG_KEY, cfg);
}

module.exports = { getConfig, saveConfig };
