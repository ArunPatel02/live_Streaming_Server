const express = require("express");
const dgram = require("dgram");
const { buffer } = require("stream/consumers");

const app = express();
const port = 4001;

const udpPort = 5001;
const udpMulticastAddress = "239.100.100.2";

const udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

const packageBuffer = [];

const BUFFER_DELAY = 10; // in seconds

let startTime = Date.now();
let isBuffering = true;

let firstTime;
let secondTime;
let oneSecondArray = [];

udpSocket.on("message", (msg) => {
  const diff = new Date() - startTime;
  secondTime = new Date();
  if (!firstTime) {
    firstTime = new Date();
  }
  const oneSecondDiff = secondTime - firstTime;
  if (oneSecondDiff >= 1000) {
    // console.log(
    //   "Received UDP message:",
    //   diff,
    //   isBuffering,
    //   oneSecondArray.length,
    //   packageBuffer.length
    // );
    packageBuffer.push(oneSecondArray);
    oneSecondArray = [];
    firstTime = null;
    secondTime = null;
  }
  if (diff > BUFFER_DELAY * 1000) {
    isBuffering = false;
  }
  oneSecondArray.push(msg);
});

udpSocket.bind(udpPort, () => {
  udpSocket.addMembership(udpMulticastAddress);

  console.log(
    `UDP socket bound and joined ${udpMulticastAddress}:${udpPort}`,
    udpSocket.getMaxListeners(),
    udpSocket.getRecvBufferSize(),
    udpSocket.getSendBufferSize(),
    udpSocket.getSendQueueCount(),
    udpSocket.getSendQueueSize()
  );
});

let currentServepackage = { isServed: false, data: [] };

let totalClient = 0;
const totalClientBuffer = [];

setInterval(() => {
  if (!isBuffering) {
    totalClientBuffer.forEach((client) => {
      const { res, bufferIndex } = client;

      if (packageBuffer.length > bufferIndex) {
        const chunk = packageBuffer[bufferIndex];
        chunk.forEach((packet) => res.write(packet));
      }
    });
  }
  if(!isBuffering){
    packageBuffer.shift();
  }
}, 1000);

app.get("/stream.ts", async (req, res) => {
  res.setHeader("Content-Type", "video/MP2T");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  totalClient++;
  console.log("Client connected:", totalClient);

  const client = {
    res,
    bufferIndex: 0,
  };

  totalClientBuffer.push(client);

  req.on("close", () => {
    console.log("Client disconnected");
    totalClient--;
    // Remove client from list
    const index = totalClientBuffer.indexOf(client);
    if (index !== -1) totalClientBuffer.splice(index, 1);
  });
});

app.listen(port, () => {
  console.log(
    `Buffered TS stream available at http://localhost:${port}/stream.ts`
  );
});
