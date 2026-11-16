# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board and acks it — "I've got this one" |
| `watch-board` | on-call | keeps the board open; polling stages arrivals, and clicking "N new" applies them without a reload |

## Requirements

- **R1** The visible list holds still while it is on screen. New arrivals wait behind an "N new" bar; clicking it brings them into the list, newest first.
- **R2** Each incident row has an **Ack** button. Ack sends the ack (`api.ack(id)`) and marks the row acked.
- **R3** Show a loader until incidents load.
- **R4** The board polls every 2 seconds while open, keeping the latest cursor for Ack. Polling must not reorder, replace or remove visible rows; only the explicit "N new" click applies the latest snapshot.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `ack` | the Ack button in a row |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |
| `new-bar` | the clickable "N new" control; its reserved space must not shift the list when it appears |

## Product decision after recorded use

Product watched the first build's acknowledgement race at 00:13 and decided:

> The list holds still while it is on screen; a "N new" bar brings new incidents in on click. Ack stays on the row.

This supersedes the original R1 immediate-insertion behavior and clarifies R4: polling continues, but application to the visible list is explicit. R2, R3, R5, R6 and all original hooks remain in force. The API schema and supplied cursor/ack client are unchanged. The bar has a permanently reserved layout slot, so its appearance cannot move an Ack target.

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
