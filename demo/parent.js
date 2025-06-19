// main.js
const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { Worker } = require("worker_threads");
const { spawn } = require("child_process");
const ChannelData = require("../channels.json");
const v8 = require("v8");

const PORT = process.env.PORT || 4001;
const start = Number(process.env.START) || 40;
const end = Number(process.env.END) || 50;
const restartThreshold = 1024; // in MB

const app = express();
const server = http.createServer(app);

/** @type {Array<Channel>} */
const channels = ChannelData.slice(start, end);
const workers = {};
const clients = {}; // senderIp -> [{ res }]

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function restartOnCondition(condition, message) {
  if (condition) {
    console.log(`Restart triggered: ${message}`);
    process.exit(1);
  }
}

function startUdpServer() {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.bind(5001, () => {
    channels.forEach(channel => {
      socket.addMembership(channel.multicastAddress);
    });
    console.log("UDP socket bound on port 5001");
  });

  socket.on("message", (msg, rinfo) => {
    const key = `${rinfo.address}.${rinfo.port}`;
    if (workers[key]) {
      workers[key].postMessage(msg);
    }
  });
}

function captureSenderIp(line) {
  const match = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\.(\d+)\b/);
  return match ? `${match[1]}.${match[2]}` : null;
}

function detectSenderIps(callback) {
  let pending = channels.length;
  channels.forEach((channel, index) => {
    const filter = `udp and dst host ${channel.multicastAddress} and dst port ${channel.port}`;
    const args = ['-i', 'any', filter, '-n', '-c', '1'];
    const tcpdump = spawn('sudo', ['/usr/bin/tcpdump', ...args]);

    tcpdump.stdout.on('data', (data) => {
      const output = data.toString();
      const senderIp = captureSenderIp(output);
      if (senderIp) {
        channels[index].senderIp = senderIp;
      }
      tcpdump.kill('SIGINT');
    });

    tcpdump.on('close', () => {
      if (--pending === 0) callback();
    });
  });
}

function spawnWorkers() {
  channels.forEach((channel, index) => {
    const key = channel.senderIp;
    clients[key] = [];

    const worker = new Worker("./demo/worker.js", {
      workerData: { senderKey: key }
    });

    worker.on("message", ({ type, payload }) => {
      if (type === "broadcast") {
        clients[key].forEach(({ res }) => {
          res.write(payload);
        });
      }
    });

    worker.on("error", err => console.error("Worker error:", err));
    worker.on("exit", code => console.log(`Worker for ${channel.name} exited with code ${code}`));

    workers[key] = worker;

    app.get(`/stream/${start + index + 1}.ts`, (req, res) => {
      res.writeHead(200, {
        "Content-Type": "video/MP2T",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      const client = { res };
      clients[key].push(client);

      req.on("close", () => {
        const idx = clients[key].indexOf(client);
        if (idx !== -1) clients[key].splice(idx, 1);
      });
    });
  });
}

function monitorMemory() {
//   setInterval(() => {
//     const heap = v8.getHeapStatistics();
//     const usedMb = heap.used_heap_size / 1024 / 1024;
//     console.log("Heap used:", formatBytes(heap.used_heap_size));
//     restartOnCondition(usedMb > restartThreshold, `Heap too large: ${usedMb.toFixed(2)}MB`);
//   }, 10000);
}

startUdpServer();
detectSenderIps(() => {
  spawnWorkers();
  monitorMemory();

  server.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
});
