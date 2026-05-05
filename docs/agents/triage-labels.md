# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's GitHub Issues.

| Canonical role    | Label in this repo | Meaning                                                 |
| ----------------- | ------------------ | ------------------------------------------------------- |
| `needs-triage`    | `needs-triage`     | Maintainer needs to evaluate this issue                 |
| `needs-info`      | `needs-info`       | Waiting on reporter for more information                |
| `ready-for-agent` | `AFK`              | Fully specified — Sonnet worker can pick it up cold     |
| `ready-for-human` | `HITL`             | Requires human implementation (architecture, manual QA) |
| `wontfix`         | `wontfix`          | Will not be actioned                                    |

`AFK` ("Can be implemented and merged without human interaction") and `HITL` ("Human-in-the-loop: requires human interaction to verify") predate this setup and are reused as-is — do not create parallel `ready-for-agent` / `ready-for-human` labels.

When a skill mentions "apply the AFK-ready triage label", use `AFK`. When it says "ready for a human", use `HITL`.
