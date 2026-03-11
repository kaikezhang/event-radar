import { eq } from 'drizzle-orm';
import type {
  FeedbackStats,
  FeedbackVerdict,
  UserFeedback,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import {
  userFeedback,
  classificationPredictions,
  classificationOutcomes,
} from '../db/schema.js';

export class UserFeedbackService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async submitFeedback(
    eventId: string,
    verdict: FeedbackVerdict,
    note?: string,
  ): Promise<void> {
    await this.db
      .insert(userFeedback)
      .values({
        eventId,
        verdict,
        note: note ?? null,
      })
      .onConflictDoUpdate({
        target: userFeedback.eventId,
        set: {
          verdict,
          note: note ?? null,
          updatedAt: new Date(),
        },
      });
  }

  async getFeedback(eventId: string): Promise<UserFeedback | null> {
    const [row] = await this.db
      .select()
      .from(userFeedback)
      .where(eq(userFeedback.eventId, eventId))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      eventId: row.eventId,
      verdict: row.verdict as FeedbackVerdict,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getFeedbackStats(): Promise<FeedbackStats> {
    const rows = await this.db.select().from(userFeedback);

    if (rows.length === 0) {
      return {
        total: 0,
        correct: 0,
        incorrect: 0,
        partiallyCorrect: 0,
        agreementRate: 0,
      };
    }

    let correct = 0;
    let incorrect = 0;
    let partiallyCorrect = 0;
    let agreements = 0;

    // Fetch all predictions and outcomes for agreement calculation
    const predictionMap = new Map<string, string>();
    const outcomeMap = new Map<string, string>();

    const predictions = await this.db
      .select({
        eventId: classificationPredictions.eventId,
        predictedDirection: classificationPredictions.predictedDirection,
      })
      .from(classificationPredictions);

    for (const p of predictions) {
      predictionMap.set(p.eventId, p.predictedDirection);
    }

    const outcomes = await this.db
      .select({
        eventId: classificationOutcomes.eventId,
        actualDirection: classificationOutcomes.actualDirection,
      })
      .from(classificationOutcomes);

    for (const o of outcomes) {
      outcomeMap.set(o.eventId, o.actualDirection);
    }

    for (const row of rows) {
      const verdict = row.verdict as FeedbackVerdict;
      if (verdict === 'correct') correct++;
      else if (verdict === 'incorrect') incorrect++;
      else if (verdict === 'partially_correct') partiallyCorrect++;

      // Agreement: does user feedback agree with auto-evaluation?
      // partially_correct is excluded from agreement calculation —
      // it's an ambiguous verdict that doesn't clearly map to auto-eval's binary correct/incorrect.
      const predicted = predictionMap.get(row.eventId);
      const actual = outcomeMap.get(row.eventId);
      if (predicted && actual && verdict !== 'partially_correct') {
        const autoCorrect = predicted === actual;
        const userSaysCorrect = verdict === 'correct';
        if (autoCorrect === userSaysCorrect) {
          agreements++;
        }
      }
    }

    // Agreement rate denominator excludes partially_correct (ambiguous verdict)
    const agreementDenominator = correct + incorrect;

    return {
      total: rows.length,
      correct,
      incorrect,
      partiallyCorrect,
      agreementRate: agreementDenominator > 0 ? agreements / agreementDenominator : 0,
    };
  }
}
