import { desc, eq, gte, sql } from 'drizzle-orm';
import {
  BudgetConfigSchema,
  BudgetDecisionSchema,
  BudgetUsageSchema,
  type BudgetConfig,
  type BudgetDecision,
  type BudgetUsage,
  type Priority,
} from '@event-radar/shared';
import type { Database } from '../db/connection.js';
import { alertLog, budgetConfig } from '../db/schema.js';

type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type DbExecutor = Database | DbTransaction;

const DEFAULT_BUDGET_CONFIG: BudgetConfig = BudgetConfigSchema.parse({
  maxAlertsPerHour: 50,
  priorityShares: {
    CRITICAL: 0,
    HIGH: 0.4,
    MEDIUM: 0.35,
    LOW: 0.25,
  },
  windowMinutes: 60,
});

export interface AlertBudgetRecord {
  id: string;
  eventId: string;
  priority: Priority;
  sentAt: string;
  suppressed: boolean;
  suppressionReason: string | null;
}

export type BudgetConfigUpdate = Partial<Omit<BudgetConfig, 'priorityShares'>> & {
  priorityShares?: Partial<BudgetConfig['priorityShares']>;
};

interface AlertBudgetServiceOptions {
  now?: () => Date;
}

export class AlertBudgetService {
  private readonly now: () => Date;

  constructor(
    private readonly db: Database,
    options?: AlertBudgetServiceOptions,
  ) {
    this.now = options?.now ?? (() => new Date());
  }

  async checkBudget(priority: Priority): Promise<BudgetDecision> {
    const config = await this.getBudgetConfig();
    const recentRows = await this.getRecentAlertRows(config.windowMinutes);

    return this.evaluateBudget(priority, recentRows, config);
  }

  async recordAlert(eventId: string, priority: Priority): Promise<void> {
    await this.db.transaction(async (tx) => {
      const config = await this.ensureConfig(tx);

      await tx.execute(sql`SELECT id FROM budget_config WHERE id = 1 FOR UPDATE`);

      const recentRows = await this.getRecentAlertRows(config.windowMinutes, tx);
      const decision = this.evaluateBudget(priority, recentRows, config);

      await tx.insert(alertLog).values({
        eventId,
        priority,
        sentAt: this.now(),
        suppressed: !decision.allowed,
        suppressionReason: decision.reason ?? null,
      });
    });
  }

  async getUsage(windowMinutes?: number): Promise<BudgetUsage> {
    const config = await this.getBudgetConfig();
    const minutes = windowMinutes ?? config.windowMinutes;
    const recentRows = await this.getRecentAlertRows(minutes);
    const usage = this.buildUsage(recentRows, {
      ...config,
      windowMinutes: minutes,
    });

    return BudgetUsageSchema.parse(usage);
  }

  async getBudgetConfig(): Promise<BudgetConfig> {
    return this.ensureConfig(this.db);
  }

  async updateBudgetConfig(config: BudgetConfigUpdate): Promise<BudgetConfig> {
    const current = await this.getBudgetConfig();
    const merged = BudgetConfigSchema.parse({
      ...current,
      ...config,
      priorityShares: {
        ...current.priorityShares,
        ...config.priorityShares,
      },
    });

    await this.db
      .insert(budgetConfig)
      .values({
        id: 1,
        maxAlertsPerHour: merged.maxAlertsPerHour,
        priorityShares: merged.priorityShares,
        windowMinutes: merged.windowMinutes,
        updatedAt: this.now(),
      })
      .onConflictDoUpdate({
        target: budgetConfig.id,
        set: {
          maxAlertsPerHour: merged.maxAlertsPerHour,
          priorityShares: merged.priorityShares,
          windowMinutes: merged.windowMinutes,
          updatedAt: this.now(),
        },
      });

    return merged;
  }

  async listSuppressed(limit = 20): Promise<AlertBudgetRecord[]> {
    const rows = await this.db
      .select()
      .from(alertLog)
      .where(eq(alertLog.suppressed, true))
      .orderBy(desc(alertLog.sentAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      priority: row.priority as Priority,
      sentAt: row.sentAt.toISOString(),
      suppressed: row.suppressed,
      suppressionReason: row.suppressionReason,
    }));
  }

  private async ensureConfig(db: DbExecutor): Promise<BudgetConfig> {
    await db
      .insert(budgetConfig)
      .values({
        id: 1,
        maxAlertsPerHour: DEFAULT_BUDGET_CONFIG.maxAlertsPerHour,
        priorityShares: DEFAULT_BUDGET_CONFIG.priorityShares,
        windowMinutes: DEFAULT_BUDGET_CONFIG.windowMinutes,
        updatedAt: this.now(),
      })
      .onConflictDoNothing();

    const [row] = await db
      .select()
      .from(budgetConfig)
      .where(eq(budgetConfig.id, 1))
      .limit(1);

    return BudgetConfigSchema.parse({
      maxAlertsPerHour: row?.maxAlertsPerHour ?? DEFAULT_BUDGET_CONFIG.maxAlertsPerHour,
      priorityShares: {
        ...DEFAULT_BUDGET_CONFIG.priorityShares,
        ...(row?.priorityShares ?? {}),
      },
      windowMinutes: row?.windowMinutes ?? DEFAULT_BUDGET_CONFIG.windowMinutes,
    });
  }

  private async getRecentAlertRows(
    windowMinutes: number,
    db: DbExecutor = this.db,
  ) {
    const windowStart = new Date(this.now().getTime() - windowMinutes * 60_000);

    return db
      .select()
      .from(alertLog)
      .where(gte(alertLog.sentAt, windowStart));
  }

  private evaluateBudget(
    priority: Priority,
    recentRows: Awaited<ReturnType<AlertBudgetService['getRecentAlertRows']>>,
    config: BudgetConfig,
  ): BudgetDecision {
    if (priority === 'CRITICAL') {
      return BudgetDecisionSchema.parse({ allowed: true });
    }

    const sentNonCritical = recentRows.filter(
      (row) => !row.suppressed && row.priority !== 'CRITICAL',
    ).length;
    const sentForPriority = recentRows.filter(
      (row) => !row.suppressed && row.priority === priority,
    ).length;
    const suppressedForPriority = recentRows.filter(
      (row) => row.suppressed && row.priority === priority,
    ).length;

    if (sentNonCritical >= config.maxAlertsPerHour) {
      return BudgetDecisionSchema.parse({
        allowed: false,
        reason: `Total alert budget exhausted for the ${config.windowMinutes} minute window`,
        queuePosition: suppressedForPriority + 1,
      });
    }

    const limits = this.computePriorityLimits(config);
    if (sentForPriority >= limits[priority]) {
      return BudgetDecisionSchema.parse({
        allowed: false,
        reason: `${priority} budget exhausted for the ${config.windowMinutes} minute window`,
        queuePosition: suppressedForPriority + 1,
      });
    }

    return BudgetDecisionSchema.parse({ allowed: true });
  }

  private buildUsage(
    recentRows: Awaited<ReturnType<AlertBudgetService['getRecentAlertRows']>>,
    config: BudgetConfig,
  ): BudgetUsage {
    const limits = this.computePriorityLimits(config);
    const priorities: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const byPriority = Object.fromEntries(
      priorities.map((priority) => {
        const used = recentRows.filter(
          (row) => !row.suppressed && row.priority === priority,
        ).length;
        return [
          priority,
          {
            used,
            limit: limits[priority],
          },
        ];
      }),
    );

    return {
      window: {
        startedAt: new Date(
          this.now().getTime() - config.windowMinutes * 60_000,
        ).toISOString(),
        minutes: config.windowMinutes,
      },
      total: {
        used: recentRows.filter((row) => !row.suppressed).length,
        limit: config.maxAlertsPerHour,
      },
      byPriority,
      suppressed: recentRows.filter((row) => row.suppressed).length,
    };
  }

  private computePriorityLimits(
    config: BudgetConfig,
  ): Record<Priority, number> {
    return {
      CRITICAL: config.maxAlertsPerHour,
      HIGH: Math.floor(config.maxAlertsPerHour * config.priorityShares.HIGH),
      MEDIUM: Math.floor(config.maxAlertsPerHour * config.priorityShares.MEDIUM),
      LOW: Math.floor(config.maxAlertsPerHour * config.priorityShares.LOW),
    };
  }
}
