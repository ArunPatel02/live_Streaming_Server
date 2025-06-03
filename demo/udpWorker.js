const { workerData, parentPort } = require('worker_threads');
const dgram = require('dgram');
const express = require('express');

const app = express();
const {
  id,
  udpPort,
  udpIp,
  interface: localInterface,
  httpPort,
} = workerData;

const clients = [];

const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true , reusePort : true });

udpSocket.on('message', (msg) => {
    // console.log(id , "-->" , msg.readUInt32BE())
  clients.forEach((res) => {
    res.write(msg);
  });
});

udpSocket.bind(udpPort, () => {
  udpSocket.addMembership(udpIp);
  console.log(`[${id}] Listening on ${udpIp}:${udpPort} via ${localInterface}`);
});

app.get('/stream.ts', (req, res) => {
  res.setHeader('Content-Type', 'video/MP2T');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  clients.push(res);
  console.log(`[${id}] Client connected`);

  req.on('close', () => {
    clients.splice(clients.indexOf(res), 1);
    console.log(`[${id}] Client disconnected`);
  });
});

app.listen(httpPort, () => {
  console.log(`[${id}] HTTP streaming at http://localhost:${httpPort}/stream.ts`);
});
