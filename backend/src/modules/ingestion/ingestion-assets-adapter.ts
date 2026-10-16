import { NotFoundError } from '../../platform/errors/app-error.js';
import type { IngestionAssetsLookup } from './lookups.js';

/**
 * Composes `assetsRepository`/`assetsService` into module 2.4's `IngestionAssetsLookup` (D-0139) —
 * the interface needs one method from each (`findAssetIdForDevice` is a plain repository read;
 * `getAssetWithAlerts` reuses the whole `GET /assets/{id}` formatting/alert-evaluation logic), so
 * a small adapter composes them rather than either module importing the other directly
 * (CONVENTIONS.md "Modules"). The caller (`IngestionService.enqueueLiveUpdates`) is responsible for
 * running both calls inside a real per-packet `runWithContextAsync` — this adapter assumes one is
 * already active (`assetsService.getAsset` relies on it for `assets`/`rules` tenant scoping).
 */
export class IngestionAssetsAdapter implements IngestionAssetsLookup {
  constructor(
    private readonly assetsRepo: {
      findAssetIdForDevice(deviceId: string): Promise<string | undefined>;
    },
    private readonly assetsService: {
      getAsset(id: string): Promise<{ success: boolean; asset: Record<string, unknown> }>;
    }
  ) {}

  findAssetIdForDevice(deviceId: string): Promise<string | undefined> {
    return this.assetsRepo.findAssetIdForDevice(deviceId);
  }

  async getAssetWithAlerts(
    assetId: string
  ): Promise<{ asset: Record<string, unknown> } | undefined> {
    try {
      const result = await this.assetsService.getAsset(assetId);
      return { asset: result.asset };
    } catch (err) {
      if (err instanceof NotFoundError) return undefined;
      throw err;
    }
  }
}
