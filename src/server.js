// backend/src/server.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Force-load backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Debug (SAFE — does not print secrets)
console.log('ENV CHECK → SUPABASE_URL =', process.env.SUPABASE_URL ? 'FOUND' : 'MISSING');
console.log('ENV CHECK → SUPABASE_SERVICE_KEY =', process.env.SUPABASE_SERVICE_KEY ? 'FOUND' : 'MISSING');

// Dynamic import to ensure env is loaded before app initialization
const { default: app } = await import('./app.js');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
