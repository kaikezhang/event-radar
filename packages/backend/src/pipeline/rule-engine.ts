import type {
  Rule,
  Condition,
  ClassificationResult,
  RawEvent,
  Severity,
} from '@event-radar/shared';
import { deriveConfidenceLevel } from '@event-radar/shared';

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const DEFAULT_SEVERITY: Severity = 'MEDIUM';
const DEFAULT_PRIORITY = 50;
const DEFAULT_CONFIDENCE = 0.8;
const MAX_CONFIDENCE = 1.0;

export class RuleEngine {
  private rules: Rule[] = [];

  loadRules(rules: Rule[]): void {
    this.rules = [...rules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  classify(event: RawEvent): ClassificationResult {
    let severity: Severity | undefined;
    const tags: string[] = [];
    let priority = DEFAULT_PRIORITY;
    const matchedRules: string[] = [];
    let confidence = MAX_CONFIDENCE; // Start at max, take min from matched rules
    let hasConfidenceFromRule = false;

    for (const rule of this.rules) {
      if (this.matchesAllConditions(rule.conditions, event)) {
        matchedRules.push(rule.id);

        for (const action of rule.actions) {
          switch (action.type) {
            case 'setSeverity':
              if (
                severity === undefined ||
                SEVERITY_ORDER.indexOf(action.value) <
                  SEVERITY_ORDER.indexOf(severity)
              ) {
                severity = action.value;
              }
              break;
            case 'addTags':
              for (const tag of action.values) {
                if (!tags.includes(tag)) {
                  tags.push(tag);
                }
              }
              break;
            case 'setPriority':
              if (action.value < priority) {
                priority = action.value;
              }
              break;
            case 'setConfidence':
              // Use the lowest confidence from matched rules (most conservative)
              confidence = Math.min(confidence, action.value);
              hasConfidenceFromRule = true;
              break;
          }
        }
      }
    }

    // If no rule set confidence, use default
    if (!hasConfidenceFromRule) {
      confidence = DEFAULT_CONFIDENCE;
    }

    const confidenceLevel = deriveConfidenceLevel(confidence);

    return {
      severity: severity ?? DEFAULT_SEVERITY,
      tags,
      priority,
      matchedRules,
      confidence,
      confidenceLevel,
    };
  }

  private matchesAllConditions(
    conditions: Condition[],
    event: RawEvent,
  ): boolean {
    return conditions.every((c) => this.matchCondition(c, event));
  }

  private matchCondition(condition: Condition, event: RawEvent): boolean {
    switch (condition.type) {
      case 'sourceEquals':
        return event.source === condition.value;

      case 'itemTypeContains': {
        const items = this.extractItemTypes(event);
        return items.some((item) => item === condition.value);
      }

      case 'titleContains':
        return event.title
          .toLowerCase()
          .includes(condition.value.toLowerCase());

      case 'tickerInList': {
        const ticker = this.extractTicker(event);
        if (!ticker) return false;
        return condition.values.some(
          (v) => v.toUpperCase() === ticker.toUpperCase(),
        );
      }
    }
  }

  private extractItemTypes(event: RawEvent): string[] {
    const meta = event.metadata;
    if (!meta) return [];
    const items = meta['item_types'];
    if (Array.isArray(items) && items.every((i) => typeof i === 'string')) {
      return items as string[];
    }
    return [];
  }

  private extractTicker(event: RawEvent): string | undefined {
    const meta = event.metadata;
    if (!meta) return undefined;
    const ticker = meta['ticker'];
    return typeof ticker === 'string' ? ticker : undefined;
  }
}
