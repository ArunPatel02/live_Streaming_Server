const express = require("express");
const dgram = require("dgram");
const http = require("http");


const PORT = 4001;

const channels = [
  {
    id : "channel1",
    multicastAddress : "239.100.100.19",
    port : 5001,
    ipaddress : "172.32.215.34"
  },
  {
    id : "channel2",
    multicastAddress : "239.100.100.45",
    port : 5001,
    ipaddress : "172.32.215.35"
  },
]

const app1 = express();
  
  app1.get("/", (req, res) => {
    res.send(JSON.stringify(channels[0]));
  })



  app1.get("/stream.ts", (req, res) => {
    console.log("Client connected for raw UDP TS stream");
  
    res.setHeader("Content-Type", "video/MP2T");
  
    const udpSocket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  
    udpSocket.on("error", (err) => {
      console.error("UDP socket error:", err);
      udpSocket.close();
      res.end();
    });
  
    let totalBytes = 0;
  
    udpSocket.on("message", (msg) => {
        console.log("app1")
      totalBytes += msg.length;
      res.write(msg); // No size or sync byte check
    });
  
    // Calculate bitrate every second
  const interval = setInterval(() => {
    const bitsPerSecond = totalBytes * 8;
    const kbps = (bitsPerSecond / 1000).toFixed(2);
    const mbps = (bitsPerSecond / 1_000_000).toFixed(3);
    console.log(`Bitrate: app 1 ${bitsPerSecond} bps | ${kbps} kbps | ${mbps} Mbps`);
    totalBytes = 0; // reset for next interval
  }, 1000);
  
    udpSocket.bind(channels[0].port, () => {
      udpSocket.addMembership(channels[0].multicastAddress);
      console.log(`Joined multicast group: ${channels[0].multicastAddress}`);
    });
    
    req.on("close", () => {
      console.log("Client disconnected, closing UDP socket");
      udpSocket.close();
      clearInterval(interval)
    });
  });
  
   // Start HTTP server on specific IP
   http.createServer(app1).listen(PORT, channels[0].ipaddress, () => {
    console.log(`HTTP streaming for ${channels[0].id} at http://${channels[0].ipaddress}:${PORT}/stream.ts`);
  });