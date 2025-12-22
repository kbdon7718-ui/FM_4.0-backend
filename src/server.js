// 🔥 MUST BE FIRST
import './env.js';

import app from './app.js';

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
