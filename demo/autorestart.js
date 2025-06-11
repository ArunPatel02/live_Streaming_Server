process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // PM2 will restart the process automatically
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // PM2 will restart the process automatically
    process.exit(1);
  });

  // Express error handler (if using Express)
const express = require('express');
const app = express();

// Your routes here...

// Global error handler (put this at the end)
app.use((err, req, res, next) => {
  console.error('Express Error:', err.stack);
  res.status(500).send('Something broke!');
  
  // For critical errors, restart the server
  if (err.critical) {
    console.log('Critical error detected, restarting server...');
    process.exit(1);
  }
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

const server = app.listen(3000, () => {
  console.log('Server running on port 3000');
});

// 5. Custom restart function for specific conditions
function restartOnCondition(condition, message) {
  if (condition) {
    console.log(`Restart triggered: ${message}`);
    process.exit(1); // PM2 will restart
  }
}

const arr = []

// Example usage:
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  console.log("heap memory -> ", heapUsedMB)
  for (let index = 0; index < 10000; index++) {
    arr.push(index*10)
  }
  // Restart if memory exceeds 400MB
  restartOnCondition(heapUsedMB > 10, `Memory usage: ${heapUsedMB.toFixed(2)}MB`);
  
  // Add your custom conditions here
  // restartOnCondition(someErrorCondition, 'Custom error occurred');
  
}, 10000);