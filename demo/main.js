const { Worker } = require('worker_threads');

const streams = [
  {
    id: 'channel1',
    udpPort: 5001,
    udpIp: '239.100.100.19',
    interface: '172.32.215.34',
    httpPort: 4001,
  },
  {
    id: 'channel2',
    udpPort: 5001,
    udpIp: '239.100.100.11',
    interface: '172.32.215.35',
    httpPort: 4001,
  },
];

streams.forEach((stream) => {
  new Worker('./udpWorker.js', {
    workerData: stream,
  });
});
