---
id: SCHED-4513
title: Board refreshes itself
status: ready
plan: R4
---

Today the board only changes when someone reloads the page. Refresh it every 2 seconds while it is open
(`fetchIncidents()` hands back what is current).

Acceptance after product's recorded-use decision: leave the board open; polling continues every two seconds and the "N new" count advances without moving the list. Only clicking the bar applies pending incidents, without a page reload.
