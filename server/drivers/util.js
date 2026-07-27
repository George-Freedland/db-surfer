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
