export function formatBytes(n) {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

// Group flat {s, t, c} column rows into a completion payload for the editor.
// Produces both bare table names and schema-qualified names as keys.
export function groupColumns(rows) {
  const schema = {};
  const columnSet = new Set();
  const tableSet = new Set();
  for (const { s, t, c } of rows) {
    (schema[t] ??= []);
    if (!schema[t].includes(c)) schema[t].push(c);
    if (s) {
      const qualified = `${s}.${t}`;
      (schema[qualified] ??= []);
      if (!schema[qualified].includes(c)) schema[qualified].push(c);
    }
    columnSet.add(c);
    tableSet.add(t);
  }
  return {
    schema,
    tables: [...tableSet].sort(),
    columns: [...columnSet].sort(),
  };
}
