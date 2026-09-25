function wrapInLaravelMockPagination(arrayData, pathUrl = 'http://example.com') {
  return {
    current_page: 1,
    data: arrayData, // Your clean product list arrays go here
    first_page_url: `${pathUrl}?page=1`,
    from: arrayData.length > 0 ? 1 : null,
    last_page: 1,
    last_page_url: `${pathUrl}?page=1`,
    links: [
      { url: null, label: '&laquo; Previous', active: false },
      { url: `${pathUrl}?page=1`, label: '1', active: true },
      { url: null, label: 'Next &raquo;', active: false },
    ],
    next_page_url: null,
    path: pathUrl,
    per_page: 10,
    prev_page_url: null,
    to: arrayData.length,
    total: arrayData.length,
  };
}
const formatDateTime = timestamp => {
  if (!timestamp) return null;
  return new Date(timestamp).toISOString();
};

const formatRelativeTime = timestamp => {
  if (!timestamp) return 'never';
  const now = Date.now();
  const msDiff = now - timestamp;
  const minutes = Math.floor(msDiff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
};

export { wrapInLaravelMockPagination, formatDateTime, formatRelativeTime };
