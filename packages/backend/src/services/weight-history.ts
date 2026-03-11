import { desc } from 'drizzle-orm';
import type { SourceWeights, WeightAdjustment } from '@event-radar/shared';
import { SourceWeightsSchema, WeightAdjustmentSchema } from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { sourceWeights, weightAdjustments } from '../db/schema.js';

export class WeightHistoryService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async recordAdjustment(
    weights: SourceWeights,
    reason: string,
    sampleSizes?: Record<string, number>,
  ): Promise<void> {
    const parsed = SourceWeightsSchema.parse(weights);
    const previous = await this.getCurrentWeights();
    const normalizedSampleSizes = this.normalizeSampleSizes(
      Object.keys(parsed.weights),
      parsed.sampleSize,
      sampleSizes,
    );

    const entries = Object.entries(parsed.weights);
    await this.db.transaction(async (tx) => {
      await tx.insert(weightAdjustments).values({
        previousWeights: previous.weights,
        newWeights: parsed.weights,
        reason,
        createdAt: new Date(parsed.updatedAt),
      });

      await tx.delete(sourceWeights);

      if (entries.length === 0) {
        return;
      }

      await tx.insert(sourceWeights).values(
        entries.map(([source, weight]) => ({
          source,
          weight: String(weight),
          sampleSize: normalizedSampleSizes[source] ?? 0,
          updatedAt: new Date(parsed.updatedAt),
        })),
      );
    });
  }

  async getHistory(limit = 20): Promise<WeightAdjustment[]> {
    const rows = await this.db
      .select()
      .from(weightAdjustments)
      .orderBy(desc(weightAdjustments.createdAt))
      .limit(limit);

    return rows.map((row) =>
      WeightAdjustmentSchema.parse({
        id: row.id,
        previousWeights: this.toNumberRecord(row.previousWeights),
        newWeights: this.toNumberRecord(row.newWeights),
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
      }),
    );
  }

  async getCurrentWeights(): Promise<SourceWeights> {
    const rows = await this.db.select().from(sourceWeights);
    const latestUpdatedAt =
      rows.reduce<Date | null>((latest, row) => {
        if (!latest || row.updatedAt > latest) {
          return row.updatedAt;
        }
        return latest;
      }, null) ?? new Date(0);

    const weights = Object.fromEntries(
      rows.map((row) => [row.source, Number(row.weight)]),
    );
    const sampleSize = rows.reduce((total, row) => total + row.sampleSize, 0);

    return SourceWeightsSchema.parse({
      weights,
      updatedAt: latestUpdatedAt.toISOString(),
      sampleSize,
    });
  }

  private normalizeSampleSizes(
    sources: string[],
    totalSampleSize: number,
    sampleSizes?: Record<string, number>,
  ): Record<string, number> {
    if (sampleSizes) {
      return Object.fromEntries(
        sources.map((source) => [source, sampleSizes[source] ?? 0]),
      );
    }

    if (sources.length === 0) {
      return {};
    }

    const base = Math.floor(totalSampleSize / sources.length);
    let remainder = totalSampleSize % sources.length;

    return Object.fromEntries(
      sources.map((source) => {
        const sampleSize = remainder > 0 ? base + 1 : base;
        remainder = Math.max(0, remainder - 1);
        return [source, sampleSize];
      }),
    );
  }

  private toNumberRecord(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, recordValue]) => [
        key,
        Number(recordValue),
      ]),
    );
  }
}
