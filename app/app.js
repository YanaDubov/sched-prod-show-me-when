import { fetchIncidents, ack } from './api.js';

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const status = document.querySelector('[role="status"]');
const error = document.querySelector('[role="alert"]');
const rows = new Map();
const acknowledged = new Map();
const pending = new Set();
const localTime = new Intl.DateTimeFormat(navigator.language, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});
let refreshing = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function createRow(incident) {
  const row = element('li', 'row', '');
  row.dataset.testid = 'incident-row';
  row.dataset.id = incident.id;
  const id = element('span', 'id', incident.id);
  const severity = element('span', 'sev', '');
  const description = element('span', 'what', '');
  const time = element('time', '', '');
  const action = element('span', 'action', '');
  const button = element('button', '', 'Ack');
  button.type = 'button';
  button.dataset.testid = 'ack';
  button.setAttribute('aria-label', `Ack ${incident.id}`);
  button.addEventListener('click', async () => {
    if (pending.has(incident.id) || acknowledged.has(incident.id)) return;
    pending.add(incident.id);
    button.disabled = true;
    button.textContent = 'Acknowledging…';
    error.textContent = '';
    try {
      const reply = await ack(incident.id);
      if (reply.id !== incident.id) throw new Error('The server acknowledged a different incident.');
      acknowledged.set(incident.id, reply.ackedAt);
      const mark = element('span', 'acked', 'Acked');
      mark.dataset.testid = 'acked';
      mark.title = `Acknowledged ${localTime.format(new Date(reply.ackedAt))}`;
      action.replaceChildren(mark);
      status.textContent = `${incident.id} acknowledged.`;
    } catch {
      error.textContent = `Could not acknowledge ${incident.id}. Please try again.`;
      button.disabled = false;
      button.textContent = 'Ack';
    } finally {
      pending.delete(incident.id);
    }
  });
  action.append(button);
  row.append(id, severity, description, time, action);
  return { row, severity, description, time };
}

function render(incidents) {
  const ordered = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const current = new Set(ordered.map(incident => incident.id));
  for (const [id, entry] of rows) {
    if (!current.has(id)) { entry.row.remove(); rows.delete(id); }
  }
  for (const [index, incident] of ordered.entries()) {
    if (!rows.has(incident.id)) rows.set(incident.id, createRow(incident));
    const entry = rows.get(incident.id);
    entry.row.className = `row ${['sev1', 'sev2', 'sev3'].includes(incident.severity) ? incident.severity : ''}`;
    entry.severity.textContent = incident.severity;
    entry.description.textContent = `${incident.service} · ${incident.region} · ${incident.summary}`;
    entry.time.dateTime = incident.openedAt;
    entry.time.textContent = localTime.format(new Date(incident.openedAt));
    entry.time.title = incident.openedAt;
    // Keep keyed row objects and event handlers rather than rebuilding controls from HTML.
    const atIndex = list.children[index];
    if (atIndex !== entry.row) list.insertBefore(entry.row, atIndex ?? null);
  }
  empty.hidden = ordered.length !== 0;
  status.textContent = `${ordered.length} incident${ordered.length === 1 ? '' : 's'} · updates every 2 seconds`;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    loader.remove();
    board.setAttribute('aria-busy', 'false');
    if (error.dataset.kind === 'refresh') { error.textContent = ''; delete error.dataset.kind; }
  } catch {
    error.dataset.kind = 'refresh';
    error.textContent = 'Could not refresh incidents. Retrying automatically; existing rows are kept.';
  } finally {
    refreshing = false;
  }
}

void refresh();
setInterval(() => { void refresh(); }, 2000);
