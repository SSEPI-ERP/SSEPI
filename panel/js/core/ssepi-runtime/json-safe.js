export function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}

export function safeJsonStringify(obj, fallback) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return fallback === undefined ? '{}' : fallback;
  }
}
