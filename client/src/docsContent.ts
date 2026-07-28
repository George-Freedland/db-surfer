export interface DocEntry {
  title: string
  code: string
  note?: string
}

export interface DocSection {
  id: string
  label: string
  entries: DocEntry[]
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'postgres',
    label: 'PostgreSQL',
    entries: [
      { title: 'Select with limit', code: 'SELECT *\nFROM "table"\nLIMIT 100;' },
      { title: 'Filter & sort', code: "SELECT id, name\nFROM users\nWHERE active = true\nORDER BY created_at DESC;" },
      { title: 'Insert', code: "INSERT INTO users (name, email)\nVALUES ('Ada', 'ada@example.com')\nRETURNING *;" },
      { title: 'Update', code: "UPDATE users\nSET active = false\nWHERE last_login < now() - interval '90 days';" },
      { title: 'Delete', code: 'DELETE FROM users\nWHERE id = 42;' },
      { title: 'Join', code: 'SELECT o.id, u.name\nFROM orders o\nJOIN users u ON u.id = o.user_id;' },
      { title: 'Aggregate', code: 'SELECT status, COUNT(*)\nFROM orders\nGROUP BY status\nHAVING COUNT(*) > 10;' },
      { title: 'Upsert (ON CONFLICT)', code: "INSERT INTO settings (key, value)\nVALUES ('theme', 'dark')\nON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;" },
      { title: 'JSON access', code: "SELECT data->>'name' AS name\nFROM events\nWHERE data->'meta'->>'type' = 'click';" },
      { title: 'List tables', code: "SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'public';" },
      { title: 'Describe columns', code: "SELECT column_name, data_type\nFROM information_schema.columns\nWHERE table_name = 'users';" },
      { title: 'Add column', code: 'ALTER TABLE users\nADD COLUMN phone text;' },
      { title: 'Create index', code: 'CREATE INDEX idx_users_email ON users (email);' },
      { title: 'Explain plan', code: 'EXPLAIN ANALYZE\nSELECT * FROM orders WHERE user_id = 1;' },
    ],
  },
  {
    id: 'mysql',
    label: 'MySQL / MariaDB',
    entries: [
      { title: 'Select with limit', code: 'SELECT *\nFROM `table`\nLIMIT 100;' },
      { title: 'Filter & sort', code: 'SELECT id, name\nFROM users\nWHERE active = 1\nORDER BY created_at DESC;' },
      { title: 'Insert', code: "INSERT INTO users (name, email)\nVALUES ('Ada', 'ada@example.com');" },
      { title: 'Update', code: 'UPDATE users\nSET active = 0\nWHERE id = 42;' },
      { title: 'Delete', code: 'DELETE FROM users\nWHERE id = 42;' },
      { title: 'Upsert', code: "INSERT INTO settings (`key`, value)\nVALUES ('theme', 'dark')\nON DUPLICATE KEY UPDATE value = VALUES(value);" },
      { title: 'Join', code: 'SELECT o.id, u.name\nFROM orders o\nJOIN users u ON u.id = o.user_id;' },
      { title: 'Show tables', code: 'SHOW TABLES;' },
      { title: 'Describe table', code: 'DESCRIBE users;' },
      { title: 'Add column', code: 'ALTER TABLE users\nADD COLUMN phone VARCHAR(20);' },
      { title: 'Create index', code: 'CREATE INDEX idx_users_email ON users (email);' },
      { title: 'JSON access', code: "SELECT JSON_EXTRACT(data, '$.name') AS name\nFROM events;" },
    ],
  },
  {
    id: 'mssql',
    label: 'SQL Server',
    entries: [
      { title: 'Select top N', code: 'SELECT TOP 100 *\nFROM [dbo].[table];' },
      { title: 'Filter & sort', code: 'SELECT id, name\nFROM users\nWHERE active = 1\nORDER BY created_at DESC;' },
      { title: 'Insert', code: "INSERT INTO users (name, email)\nVALUES ('Ada', 'ada@example.com');" },
      { title: 'Update', code: 'UPDATE users\nSET active = 0\nWHERE id = 42;' },
      { title: 'Delete', code: 'DELETE FROM users\nWHERE id = 42;' },
      { title: 'Paging (OFFSET/FETCH)', code: 'SELECT *\nFROM users\nORDER BY id\nOFFSET 100 ROWS FETCH NEXT 50 ROWS ONLY;' },
      { title: 'Upsert (MERGE)', code: 'MERGE settings AS t\nUSING (SELECT \'theme\' AS [key], \'dark\' AS value) AS s\nON t.[key] = s.[key]\nWHEN MATCHED THEN UPDATE SET value = s.value\nWHEN NOT MATCHED THEN INSERT ([key], value) VALUES (s.[key], s.value);' },
      { title: 'List tables', code: 'SELECT name FROM sys.tables;' },
      { title: 'Describe columns', code: "SELECT COLUMN_NAME, DATA_TYPE\nFROM INFORMATION_SCHEMA.COLUMNS\nWHERE TABLE_NAME = 'users';" },
      { title: 'Add column', code: 'ALTER TABLE users\nADD phone NVARCHAR(20);' },
    ],
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    entries: [
      { title: 'Select with limit', code: 'SELECT *\nFROM "table"\nLIMIT 100;' },
      { title: 'Insert', code: "INSERT INTO users (name, email)\nVALUES ('Ada', 'ada@example.com');" },
      { title: 'Update', code: 'UPDATE users\nSET active = 0\nWHERE id = 42;' },
      { title: 'Delete', code: 'DELETE FROM users\nWHERE id = 42;' },
      { title: 'Upsert', code: "INSERT INTO settings (key, value)\nVALUES ('theme', 'dark')\nON CONFLICT(key) DO UPDATE SET value = excluded.value;" },
      { title: 'List tables', code: "SELECT name FROM sqlite_master WHERE type = 'table';" },
      { title: 'Describe table', code: 'PRAGMA table_info(users);' },
      { title: 'Create table', code: 'CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  email TEXT UNIQUE\n);' },
      { title: 'Create index', code: 'CREATE INDEX idx_users_email ON users (email);' },
    ],
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    entries: [
      {
        title: 'Find (query documents)',
        code: '{"find": "users", "filter": {"active": true}, "limit": 50}',
        note: 'DBSurfer runs JSON command documents against the connection database.',
      },
      { title: 'Find with sort', code: '{"find": "orders", "filter": {}, "sort": {"createdAt": -1}, "limit": 20}' },
      { title: 'Count', code: '{"count": "users", "query": {"active": true}}' },
      { title: 'Insert', code: '{"insert": "users", "documents": [{"name": "Ada", "email": "ada@example.com"}]}' },
      { title: 'Update', code: '{"update": "users", "updates": [{"q": {"_id": "..."}, "u": {"$set": {"active": false}}}]}' },
      { title: 'Delete', code: '{"delete": "users", "deletes": [{"q": {"_id": "..."}, "limit": 1}]}' },
      { title: 'Aggregate', code: '{"aggregate": "orders", "pipeline": [{"$group": {"_id": "$status", "n": {"$sum": 1}}}], "cursor": {}}' },
      { title: 'Distinct', code: '{"distinct": "users", "key": "country"}' },
      { title: 'List collections', code: '{"listCollections": 1}' },
    ],
  },
  {
    id: 'redis',
    label: 'Redis',
    entries: [
      { title: 'Get / set a string', code: 'SET mykey "hello"\nGET mykey', note: 'One command per line.' },
      { title: 'Expire / TTL', code: 'SET session:1 "data" EX 3600\nTTL session:1' },
      { title: 'Increment', code: 'INCR counter\nINCRBY counter 5' },
      { title: 'Hashes', code: 'HSET user:1 name Ada age 30\nHGETALL user:1' },
      { title: 'Lists', code: 'RPUSH queue a b c\nLRANGE queue 0 -1' },
      { title: 'Sets', code: 'SADD tags red blue\nSMEMBERS tags' },
      { title: 'Sorted sets', code: 'ZADD board 100 alice 90 bob\nZRANGE board 0 -1 WITHSCORES' },
      { title: 'Keys & scan', code: 'KEYS user:*\nSCAN 0 COUNT 100' },
      { title: 'Delete', code: 'DEL mykey' },
      { title: 'Type & inspect', code: 'TYPE mykey\nOBJECT ENCODING mykey' },
    ],
  },
]

export const ABOUT = {
  label: 'About DBSurfer',
  paragraphs: [
    'DBSurfer is a free, open-source, browser-based SQL client. Think DBeaver, pgAdmin, or Azure Data Studio, but running locally in your browser.',
    'Connect to as many databases as you want across PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, and Redis. Connection details are stored locally in ~/.dbsurfer so reconnecting is instant, and you can clear saved credentials at any time.',
    'Everything runs on your machine: a small Express + node-driver backend and a React + CodeMirror frontend. Nothing is sent to any third party.',
    'It is MIT-licensed and open source. Contributions are welcome.',
  ],
  repo: 'https://github.com/George-Freedland/db-surfer',
  bitcoin: '33tnUt2xyhVEKjQ986dnYcWUujYP9eAHPa',
}
