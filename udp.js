const express = require("express");
const dgram = require("dgram");
const http = require("http");

const app = express();
const port = 4001;

const udpPort = 5001;
const udpMulticastAddress = "239.100.100.20"; //TNT: 20 ESPN: 45
// const udpMulticastAddress = "239.100.100.51";

app.get("/stream.ts", (req, res) => {
  console.log("Client connected for raw UDP TS stream");

  res.setHeader("Content-Type", "video/MP2T");
//   res.setHeader("Cache-Control", "no-cache");

  const udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });

  udpSocket.on("error", (err) => {
    console.error("UDP socket error:", err);
    udpSocket.close();
    res.end();
  });

  let totalBytes = 0;

  udpSocket.on("message", (msg) => {
    totalBytes += msg.length;
    res.write(msg); // No size or sync byte check
  });

  // Calculate bitrate every second
const interval = setInterval(() => {
  const bitsPerSecond = totalBytes * 8;
  const kbps = (bitsPerSecond / 1000).toFixed(2);
  const mbps = (bitsPerSecond / 1_000_000).toFixed(3);
  console.log(`Bitrate: ${bitsPerSecond} bps | ${kbps} kbps | ${mbps} Mbps`);
  totalBytes = 0; // reset for next interval
}, 1000);

  udpSocket.bind(udpPort, () => {
    udpSocket.addMembership(udpMulticastAddress);
    console.log(`Joined multicast group: ${udpMulticastAddress}`);
  });
  
  req.on("close", () => {
    console.log("Client disconnected, closing UDP socket");
    udpSocket.close();
    clearInterval(interval)
  });
});

app.listen(port, () => {
  console.log(`TS stream available at http://localhost:${port}/stream.ts`);
});
