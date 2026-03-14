# Scanner Operations Matrix

This document tracks scanner sources, expected polling cadence, and latency characteristics.

## Scanner list

| Scanner (registry id) | Source | Poll interval | Typical latency | Max expected delay |
|---|---|---:|---:|---:|
| analyst | analyst | 10 min | ≤10 min | 2× poll interval |
| breaking-news | breaking-news | 1 min | ≤1 min | 2× poll interval |
| congress | congress | 30 min | ≤30 min | 2× poll interval |
| dilution-monitor | dilution-monitor | 1 min | ≤1 min | 2× poll interval |
| doj-antitrust | doj | 15 min | ≤15 min | 2× poll interval |
| dummy | dummy | 10 sec | ≤10 sec | 2× poll interval |
| earnings | earnings | 30 min | ≤30 min | 2× poll interval |
| econ-calendar | econ-calendar | 1 min | ≤1 min | 2× poll interval |
| fedwatch | fedwatch | 5 min | ≤5 min | 2× poll interval |
| federal-register | federal-register | 15 min | ≤15 min | 2× poll interval |
| fda | fda | 5 min | ≤5 min | 2× poll interval |
| newswire | newswire | 2 min | ≤2 min | 2× poll interval |
| pr-newswire | pr-newswire | 2 min | ≤2 min | 2× poll interval |
| businesswire | businesswire | 2 min | ≤2 min | 2× poll interval |
| globenewswire | globenewswire | 2 min | ≤2 min | 2× poll interval |
| short-interest | short-interest | 60 min | ≤60 min | 2× poll interval |
| stocktwits | stocktwits | 1 min | ≤1 min | 2× poll interval |
| trading-halt | trading-halt | 15 sec | ≤15 sec | 2× poll interval |
| unusual-options | unusual-options | 5 min | ≤5 min | 2× poll interval |
| x-elonmusk | x | 30 sec | ≤30 sec | 2× poll interval |
| ir-monitor | company-ir | 5 min | ≤5 min | 2× poll interval |
| sec-edgar | sec-edgar | 1 min (8-K), 2 min (form-4) | ≤2 min | 2× effective poll interval |
| truth-social | truth-social | 15 sec | ≤15 sec | 2× poll interval |
| whitehouse | whitehouse | 15 min | ≤15 min | 2× poll interval |
| warn-act | warn-act | 1 hour | ≤1 hour | 2× poll interval |
| reddit | reddit | 1 min | ≤1 min | 2× poll interval |

## Notes

- Scanner **latency** is measured as the time from upstream publication/update to ingestion.
- A conservative model for operational reporting is to assume up to `2 × pollInterval` under normal API and network conditions.
- Several scanners (`newswire`, `federal-register`) fetch multiple feed sources under one scanner id; those rows map the scanner’s shared polling behavior.
- `sec-edgar` fetches a dedicated 8-K feed every 1m and Form 4 feed every 2m inside same scanner.

## Source naming normalization

Some legacy sources/aliases are normalized by scanner registry at lookup time.

- `x`, `twitter` → `x-elonmusk`
- `form-4`, `form4`, `8k`, `8-k` → `sec-edgar`

If you want a scanner endpoint by alternate alias, route using the normalized target name above.
