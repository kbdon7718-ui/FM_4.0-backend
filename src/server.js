// 🔥 MUST BE FIRST LINE
import './env.js';

import app from './app.js';

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
