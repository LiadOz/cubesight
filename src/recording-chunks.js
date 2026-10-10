// Fixed sequence buckets keep recurring IndexedDB writes independent of the
// recording's total size. Entries are immutable once appended by the recorder.
const CHUNK_SIZE = 512;
export function planRecordingChunks(events, previous = new Map()) {
  const groups = new Map();
  for (const event of events) {
    const key = `events:${Math.floor(event.seq / CHUNK_SIZE)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const signatures = new Map(), writes = [];
  for (const [key, entries] of groups) {
    const signature = `${entries.length}:${entries[0].seq}:${entries.at(-1).seq}`;
    signatures.set(key, signature);
    if (previous.get(key) !== signature) writes.push({ key, events: entries });
  }
  return { signatures, writes, deletes: [...previous.keys()].filter(key => !groups.has(key)) };
}

export function restoreRecordingChunks(saved, rows) {
  if (!saved?.chunked) return saved;
  const entries = rows.filter(row => row.key?.startsWith('events:')).flatMap(row => row.events || [])
    .sort((a, b) => a.seq - b.seq);
  return { ...saved, recording: { ...saved.recording, events: entries } };
}
