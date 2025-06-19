const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require('stream')
const { Throttle } = require('stream-throttle')

const app = express();
const port = 4001;

const udpPort = 5001;
const udpMulticastAddress = "239.100.100.49"; //TNT: 20 ESPN: 45
// const udpMulticastAddress = "239.100.100.51";

app.get("/", (req, res) => {
  res.send('udp is running')
})

app.get("/stream/47.ts", (req, res) => {
  console.log("Client connected for raw UDP TS stream");

  res.writeHead(200, {
    "Content-Type": "video/MP2T",
    "Transfer-Encoding": "chunked",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  // res.setHeader("Content-Type", "video/MP2T"); //this will tell the client the res data will be of video/mp2t type
  //   res.setHeader("Cache-Control", "no-cache");

  const udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true  }); // used to create udpsocket
  const clientStream = new PassThrough()
  // Throttle to 5 Mbps (5 * 1024 * 1024 bytes/sec)
  const throttleStream = new Throttle({ rate: 3 * 1024 * 1024 });

  udpSocket.on("error", (err) => {
    console.error("UDP socket error:", err);
    udpSocket.close();
    res.end();
  });

  let totalBytes = 0;

  udpSocket.on("message", (msg) => {
    totalBytes += msg.length;
    // clientStream.write(msg)
    res.write(msg); // No size or sync byte check
  });

  // clientStream.pipe(throttleStream).pipe(res);

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
