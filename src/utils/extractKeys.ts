import { getKeyAfterLastDot } from './mapExtractedKeys';

function extractKeysFromPacket(obj, basePath = '') {
  if (!obj) return [];

  const result = [];
  const stack = [{ value: obj, path: basePath }];

  while (stack.length > 0) {
    const { value, path } = stack.pop();

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          stack.push({ value: parsed, path });
          continue;
        }
      } catch (e) {
        // not JSON, treat as primitive
      }
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        stack.push({ value: item, path: `${path}[${index}]` });
      });
    } else if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        if (value.hasOwnProperty(key)) {
          const newPath = path ? `${path}.${key}` : key;
          stack.push({ value: value[key], path: newPath });
        }
      }
    } else {
      // store both path and its actual value
      result.push({ path, actualValue: value });
    }
  }

  const mapped = result.map(({ path, actualValue }) => {
    // const parts = path.split(/[\.\[\]]/).filter(Boolean);
    const adjustedLabel = getKeyAfterLastDot(path);
    return {
      // label: parts[parts.length - 1],
      label: adjustedLabel,
      value: path,
      actualValue: actualValue,
    };
  });

  return mapped;
}

export { extractKeysFromPacket };
