function mapExtractedKeys(userPreferences) {
  if (!userPreferences) return [];

  const mappedExtractedKeys = userPreferences
    .filter(up => !up.is_unique_identifier)
    .map(up => {
      // const parts = path.split(/[\.\[\]]/).filter(Boolean);
      return {
        ...up,
        value: up.attribute_key,
      };
    });
  return mappedExtractedKeys;
}

function getKeyAfterLastDot(str) {
  // Guard clause: return empty if no value or invalid string
  if (!str) return '';
  return str.substring(str.lastIndexOf('.') + 1);
}

export { mapExtractedKeys, getKeyAfterLastDot };
