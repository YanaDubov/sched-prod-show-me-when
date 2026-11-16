---
id: SCHED-4511
title: Live list with Ack per row
status: ready
plan: R1, R2
---

On-call needs to see new incidents the moment they come in and take one with a click.

- Product's recorded-use decision supersedes immediate insertion: stage arrivals in an "N new" bar and insert them newest first only when clicked (R1).
- Each row gets an **Ack** button (`data-testid="ack"`). Clicking it calls `api.ack(id)` and marks the row
  acked (`data-testid="acked"`) (R2).

Acceptance: a new incident updates the bar without moving visible rows; clicking the bar brings it in at the top without a reload; Ack stays on and acknowledges the intended row.
