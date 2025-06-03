// // This Node.js example demonstrates handling two UDP streams from separate IPs
// // and serving them as MPEG-TS to clients via the same HTTP endpoint (/stream.ts)
// // on the same HTTP port (4000), distinguished by server IP.

// const dgram = require('dgram');
// const express = require('express');
// const { PassThrough } = require('stream');
// const http = require('http');

// // Example configurations for 2 incoming streams
// const STREAMS = [
//   {
//     id: 'channel1',
//     udpPort: 5001,
//     udpIp: '239.100.100.19', // Multicast or source IP
//     httpPath: '/stream.ts',
//     serverIp: '172.32.215.34',
//   },
//   {
//     id: 'channel2',
//     udpPort: 5001,
//     udpIp: '239.100.100.11', // Multicast or source IP
//     httpPath: '/stream.ts',
//     serverIp: '172.32.215.35',
//   },
// ];

// const HTTP_PORT = 4001;

// const clients = {
//     channel1 : [],
//     channel2 : []
// }

// STREAMS.forEach(({ id, udpPort, udpIp, httpPath, serverIp }) => {
//   const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
//   const bufferStream = new PassThrough();

//   socket.on('error', (err) => {
//     console.error(`UDP socket error on ${id}:`, err);
//     socket.close();
//   });

//   socket.on('message', (msg) => {
//     bufferStream.write(msg);
//   });

//   socket.bind(udpPort, () => {
//     try {
//       socket.addMembership(udpIp); // Join multicast group with specified interface IP
//       console.log(`${id} listening on ${udpIp}:${udpPort} via ${serverIp}`);
//     } catch (err) {
//       console.error(`Failed to join multicast for ${id}:`, err);
//     }
//   });

//   const app = express();

//   app.get('/stream.ts', (req, res) => {
//     console.log('client connected for channel ' , id)
//     res.setHeader("Content-Type", "video/MP2T");

//     const clientStream = new PassThrough();
//     bufferStream.pipe(clientStream);
//     clientStream.pipe(res);

//     req.on('close', () => {
//         console.log('cleint disconnected ' , id)
//       clientStream.destroy();
//     });
//   });

//   http.createServer(app).listen(HTTP_PORT, serverIp, () => {
//     console.log(`${id} HTTP server running on http://${serverIp}:${HTTP_PORT}${httpPath}`);
//   });
// });

const dgram = require('dgram');
const express = require('express');
const { PassThrough } = require('stream');
const http = require('http');

// Configuration for each channel
const STREAMS = [
  {
    id: 'channel1',
    udpPort: 5001,
    udpIp: '239.100.100.19',
    interface: '172.32.215.34', // Your host IP for this interface
    httpPort: 4001
  },
  {
    id: 'channel2',
    udpPort: 5001,
    udpIp: '239.100.100.20',
    interface: '172.32.215.35', // Your host IP for second interface
    httpPort: 4001
  }
];

const clientsMap  = new Map()

const buffer = [];
let oneSecondBuffer = []
let starttime;
let endtime;
const bufferStream = new PassThrough();

function createServerForStream({ id, udpPort, udpIp, interface: iface, httpPort }) {
  const udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  udpSocket.on('message', (msg , info) => {
    // console.log(`[${id}] Received ${msg.length} bytes ${JSON.stringify(info)}`);
    // const getClient = clientsMap.get(id)
    if(id === 'channel1'){
        endtime = new Date()
        // if(starttime && !endtime){
        // }
        if(!starttime){
            starttime = new Date()
        }
        if((endtime - starttime) >= 1000){
            buffer.push(oneSecondBuffer)
            oneSecondBuffer = []
            starttime = new Date()
            // endtime  = null
        }
        // console.log(endtime - starttime , oneSecondBuffer.length , buffer.length)
        oneSecondBuffer.push(msg)
        // buffer.push(msg)
        // bufferStream.write(msg)
    }
    // console.log('getclient ' , getClient)
    // getClient?.res.write(msg)
    // bufferStream.write(msg);
  })

  udpSocket.on('error', (err) => {
    console.error(`UDP error on ${id}:`, err);
    udpSocket.close();
  });

  udpSocket.bind(udpPort, () => {
    try {
      udpSocket.addMembership(udpIp);
      console.log(`${id} joined multicast group ${udpIp} on interface ${iface}`);
    } catch (err) {
      console.error(`Failed to join multicast for ${id}:`, err);
    }
  });

  const app = express();

  app.get('/stream.ts', (req, res) => {
    console.log(`Client connected to ${id}`);
    res.setHeader('Content-Type', 'video/MP2T')

    clientsMap.set(id , {res})

    const clientStream = new PassThrough();
    setInterval(() => {
        if(id === 'channel1' && buffer[0]){
            console.log('sending')
            buffer[0].forEach(packet => res.write(packet))
            buffer.shift()
        }
    }, 1000);
    // bufferStream.pipe(clientStream).pipe(res);

    clientStream.on('data', (chunk) => {
        console.log(`[${id}] Sent ${chunk.length} bytes to client`);
      });

    req.on('close', () => {
      console.log(`Client disconnected from ${id}`);
      clientStream.destroy();
    });
  });

  http.createServer(app).listen(httpPort, iface, () => {
    console.log(`${id} HTTP server running at http://${iface}:${httpPort}/stream.ts`);
  });
}

// Start servers for all configured streams
STREAMS.forEach(createServerForStream);

// const express = require('express');
// const dgram = require('dgram');
// const http = require('http');
// const { PassThrough } = require('stream');

// class UdpStreamBuffer {
//   constructor({ udpPort, multicastIp, iface }) {
//     this.udpPort = udpPort;
//     this.multicastIp = multicastIp;
//     this.iface = iface;

//     this.udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
//     this.bufferStream = new PassThrough();

//     this.initSocket();
//   }

//   initSocket() {
//     this.udpSocket.on('error', (err) => {
//       console.error(`[${this.multicastIp}] UDP socket error:`, err);
//       this.udpSocket.close();
//     });

//     this.udpSocket.on('message', (msg) => {
//       this.bufferStream.write(msg);
//     });

//     this.udpSocket.bind(this.udpPort, () => {
//       try {
//         this.udpSocket.addMembership(this.multicastIp);
//         console.log(`[${this.multicastIp}] Joined multicast group on interface ${this.iface}`);
//       } catch (err) {
//         console.error(`[${this.multicastIp}] Failed to join multicast group:`, err);
//       }
//     });
//   }

//   getStream() {
//     // Return a new readable stream for each client to avoid pipe issues
//     const clientStream = new PassThrough();
//     this.bufferStream.pipe(clientStream);
//     return clientStream;
//   }

//   close() {
//     this.udpSocket.close();
//     this.bufferStream.end();
//   }
// }

// const STREAMS = [
//   { id: 'channel1', udpPort: 5001, multicastIp: '239.100.100.19', iface: '172.32.215.34' },
// //   { id: 'channel2', udpPort: 5001, multicastIp: '239.100.100.20', iface: '172.32.215.34' },
// ];

// const app = express();
// const port = 4001;

// const streamBuffers = new Map();

// // Create buffer service for each stream
// STREAMS.forEach(({ id, udpPort, multicastIp, iface }) => {
//   const bufferService = new UdpStreamBuffer({ udpPort, multicastIp, iface });
//   streamBuffers.set(id, bufferService);
// });

// app.get('/stream/:channelId.ts', (req, res) => {
//   const { channelId } = req.params;
//   const bufferService = streamBuffers.get(channelId);

//   if (!bufferService) {
//     return res.status(404).send('Channel not found');
//   }

//   res.setHeader('Content-Type', 'video/MP2T');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');

//   const clientStream = bufferService.getStream();

//   clientStream.pipe(res);

//   req.on('close', () => {
//     clientStream.destroy();
//     console.log(`Client disconnected from ${channelId}`);
//   });

//   console.log(`Client connected to ${channelId}`);
// });

// http.createServer(app).listen(port, () => {
//   console.log(`HTTP server running on port ${port}`);
// });

