import { z } from 'zod';
import { openApiRegistry } from './registry.js';

/**
 * Registers a `GET …/export` operation (D-0168, B11): its 200 response is a streamed `text/csv` download, not the JSON envelope the
 * generic path loops register. The query parameters are the matching list's own (the generator derives them from the handler's schema).
 */
export function registerCsvExportPath(path: string, tag: string, summary: string): void {
  openApiRegistry.registerPath({
    method: 'get',
    path,
    tags: [tag],
    summary,
    responses: {
      200: {
        description:
          'CSV download (UTF-8 with BOM, RFC 4180 rows, header row first); `Content-Disposition: attachment`, `X-Export-Row-Count` = the number of data rows',
        content: { 'text/csv': { schema: z.string() } },
      },
    },
  });
}
