// backend/src/server.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env explicitly
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Safe debug (no secrets printed)
console.log(
  'ENV CHECK → SUPABASE_URL =',
  process.env.SUPABASE_URL ? 'FOUND' : 'MISSING'
);
console.log(
  'ENV CHECK → SUPABASE_SERVICE_ROLE_KEY =',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'FOUND' : 'MISSING'
);

// Import app AFTER env is loaded
import {app} from './fleetlocation.js';

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
