import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.test explicitly so integration tests never touch the development database.
for (const line of readFileSync(join(__dirname, '../../.env.test'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]!] = m[2];
}
if (!process.env.DATABASE_URL?.includes('emcom_test')) throw new Error('refusing to run integration tests outside emcom_test');
