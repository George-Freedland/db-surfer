import * as postgres from './postgres.js';
import * as mysql from './mysql.js';
import * as mssql from './mssql.js';
import * as sqlite from './sqlite.js';
import * as mongodb from './mongodb.js';
import * as redis from './redis.js';

export const DB_TYPES = {
  postgres: { label: 'PostgreSQL', defaultPort: 5432 },
  mysql: { label: 'MySQL / MariaDB', defaultPort: 3306 },
  mssql: { label: 'SQL Server', defaultPort: 1433 },
  sqlite: { label: 'SQLite', defaultPort: 0 },
  mongodb: { label: 'MongoDB', defaultPort: 27017 },
  redis: { label: 'Redis', defaultPort: 6379 },
};

const drivers = { postgres, mysql, mssql, sqlite, mongodb, redis };

export function getDriver(type) {
  return drivers[type] || drivers.postgres;
}

export function isValidType(type) {
  return type in drivers;
}
