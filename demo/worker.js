// worker.js
const { parentPort, workerData } = require('worker_threads');

const senderKey = workerData.senderKey;

parentPort.on('message', (msg) => {
  parentPort.postMessage({ type: 'broadcast', payload: msg });
});
