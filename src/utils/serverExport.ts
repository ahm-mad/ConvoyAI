/* eslint-disable @typescript-eslint/no-explicit-any */
import axiosInstance from '@root/axiosConfig';

/**
 * Server-side CSV export (flows/06 §15.4, backend B11): `GET …/export` takes the list's own search /
 * filters / sort (`page` / `per_page` are ignored) and streams EVERY matching row (≤ 50,000) as
 * `text/csv` with a UTF-8 BOM. The endpoint needs the bearer token, so it is fetched with the shared
 * axios client and saved as a Blob (a plain <a href> could not send the token).
 *
 * Over the cap the backend answers a normal JSON 422 ("The export matches N rows; the limit is 50000
 * per export. Narrow the filter.") — read it out of the blob and throw it as an Error.
 */
export async function downloadServerCsv(
  path: string,
  params: Record<string, unknown>,
  fallbackName: string
): Promise<{ rows: number | null; filename: string }> {
  let res;

  try {
    res = await axiosInstance.get(path, { params, responseType: 'blob' });
  } catch (e: any) {
    // With responseType 'blob' an error body is a Blob too — turn it back into the JSON message.
    const blob = e?.response?.data;
    let message = 'Could not export.';

    if (blob instanceof Blob) {
      try {
        message = JSON.parse(await blob.text())?.message || message;
      } catch {
        /* not JSON — keep the generic message */
      }
    }

    throw new Error(message);
  }

  const disposition: string = res.headers['content-disposition'] ?? '';
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  const count = Number(res.headers['x-export-row-count']);
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { rows: Number.isFinite(count) ? count : null, filename };
}
