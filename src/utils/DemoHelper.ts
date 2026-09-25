const DEMO_KEYS_STORAGE = '';

function getAllDemoKeys() {
  const raw = localStorage.getItem(DEMO_KEYS_STORAGE);
  return raw ? JSON.parse(raw) : {};
}

function saveAllDemoKeys(keysObj) {
  localStorage.setItem(DEMO_KEYS_STORAGE, JSON.stringify(keysObj));
}
export function isFirstDemo(demoId) {
  const keys = getAllDemoKeys();

  if (keys[demoId]) {
    return false;
  }

  keys[demoId] = true;
  saveAllDemoKeys(keys);
  return true;
}

//reset specific demo
export function resetDemo(demoId) {
  const keys = getAllDemoKeys();
  delete keys[demoId];
  saveAllDemoKeys(keys);
}
