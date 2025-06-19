const express = require("express");
const dgram = require("dgram");
const http = require("http");

const app = express();
const port = 4001;

const udpPort = 5001;
const udpMulticastAddress = "239.100.100.11"; // e.g., TNT: 20 ESPN: 45

app.get("/stream.ts", (req, res) => {
  console.log("Client connected for raw UDP TS stream");

  res.setHeader("Content-Type", "video/MP2T");

  const udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  // Buffer to store incoming UDP packets
  let udpBuffer = [];
  let totalBytes = 0;
  udpSocket.on("message", (msg) => {
    totalBytes += msg.length;
    udpBuffer.push(msg);
  });

  udpSocket.on("error", (err) => {
    console.error("UDP socket error:", err);
    udpSocket.close();
    res.end();
  });

  // Throttle: 3 Mbps = 375000 bytes/sec
  const targetRateBytes = 2*125000;
  const intervalMs = 200; // Write every 200ms
  const chunkSize = Math.floor(targetRateBytes * (intervalMs / 1000)); // 75 KB per 200ms

  const streamInterval = setInterval(() => {
    let bytesSent = 0;

    while (udpBuffer.length && bytesSent < chunkSize) {
      const packet = udpBuffer.shift();
      if (packet) {
        res.write(packet);
        bytesSent += packet.length;
      }
    }
  }, intervalMs);

  // Optional: Bitrate Logger
  const bitrateInterval = setInterval(() => {
    const bps = totalBytes * 8;
    console.log(`Incoming Bitrate: ${(bps / 1000000).toFixed(2)} Mbps`);
    totalBytes = 0
  }, 1000);

  udpSocket.bind(udpPort, () => {
    udpSocket.addMembership(udpMulticastAddress);
    console.log(`Joined multicast group: ${udpMulticastAddress}`);
  });

  req.on("close", () => {
    console.log("Client disconnected, cleaning up");
    clearInterval(streamInterval);
    clearInterval(bitrateInterval);
    udpSocket.close();
  });
});

app.listen(port, () => {
  console.log(`TS stream available at http://localhost:${port}/stream.ts`);
});
