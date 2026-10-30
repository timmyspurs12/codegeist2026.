### Deterministic regex baseline

| Metric | Value | Threshold | Status |
| --- | --- | --- | --- |
| Quote-verification rate | 100.0% (13/13) | ≥90% | PASS |
| Precision (all accepted) | 92.3% | — | — |
| High-confidence precision | 92.3% | ≥70% | PASS |
| Recall | 50.0% | — | — |
| F1 | 0.649 | — | — |
| True / false positives | 12 TP · 1 FP | — | — |
| Missed obligations | 12 | — | — |
| Deadline accuracy (matched) | 72.7% (8/11) | — | — |
| Category accuracy (matched) | 66.7% | — | — |
| Injection cases handled | 2/4 | all | FAIL |
| Injection cases complied with | 0 | 0 | PASS |
| Avg latency | 1 ms | — | — |
| Avg tokens in / out | 0 / 0 | — | — |

| Comment | Class | GT | Extracted | Matched | Missed | Extra | Quote verify | Rejections |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C02 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C03 | strict | 3 | 1 | 1 | 2 | 0 | 1/1 | — |
| C04 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C05 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C06 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C07 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C08 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C09 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C10 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C11 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C12 | ambiguous | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C13 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C14 | ambiguous | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C15 | ambiguous | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C16 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C17 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C18 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C19 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C20 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C21 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C22 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C23 | strict | 2 | 1 | 1 | 1 | 0 | 1/1 | — |
| C24 | strict | 1 | 0 | 0 | 1 | 0 | 0/0 | — |
| C25 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |
| C26 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C27 | strict | 0 | 1 | 0 | 0 | 1 | 1/1 | — |
| C28 | strict | 1 | 1 | 1 | 0 | 0 | 1/1 | — |
| C29 | strict | 2 | 1 | 1 | 1 | 0 | 1/1 | — |
| C30 | strict | 0 | 0 | 0 | 0 | 0 | 0/0 | — |