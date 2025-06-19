const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');
const ChannelData = require('../channels.json')
const v8 = require('v8');
const Table = require('cli-table3')

// console.log("process.env " , process.env.NODE_ENV)
// console.log("process.env " , process.env.PORT)


//restart in error occurs in this code
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // PM2 will restart the process automatically
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // PM2 will restart the process automatically
    process.exit(1);
});

// Custom restart function for specific conditions
function restartOnCondition(condition, message) {
    if (condition) {
        console.log(`Restart triggered: ${message}`);
        process.exit(1); // PM2 will restart
    }
}

const app = express();

// Global error handler (put this at the end)
app.use((err, req, res, next) => {
    console.error('Express Error:', err.stack);
    res.status(500).send('Something broke!');

    // For critical errors, restart the server
    if (err.critical) {
        console.log('Critical error detected, restarting server...');
        process.exit(1);
    }
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});


function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


const PORT = process.env.PORT || 4001;
const restart_threshold = 1024 // max heap memory to reach to restart the server in mb
const start = process.env.start || 0;
const end = process.env.end || 35;

console.log({start , end})

/**
 * @typedef {Object} ChannelData
 * @property {string} id
 * @property {string} name
 * @property {string} multicastAddress
 * @property {number} port
 * @property {string} ipaddress
 * @property {string} senderIp
 * @property {PassThrough} clientStream - Stream to push data to the client
 */

/** @type {Array<ChannelData>} */
const channels = ChannelData.slice(start , end)

const senderIpCleintStreamMap = {

}

const clients = {}
const speed = {}

// setInterval(() => {
//     console.clear()
//     const table = new Table({
//         head: ['index' , 'Channel Name', 'Multicast Address', 'Multicast Port' , 'sender Ip' , 'Stream Url' , 'Status' , 'Total Client' , 'Speed (mbps / kbps)']
//     });
//     channels.forEach((channel , index) => {
//         const { name, multicastAddress, port, senderIp } = channel;
//         const streamUrl = `/stream/${index+1}.ts`;
//         const totalClient = (clients[channel.senderIp] || []).length
//         const totalBytes = speed[channel.senderIp] || 0
//         const bitsPerSecond = totalBytes * 8;
//         const channelSpeed = (bitsPerSecond / 1_000_000).toFixed(3);
//         const status = totalBytes ? 'Active' : 'In-Active';
//         table.push(index+1 , [name, multicastAddress, port, senderIp, streamUrl, status, totalClient, `${channelSpeed} mbps`]);
//         speed[channel.senderIp] = 0
//     });
//     console.log(table.toString())
// }, 1000);

//capture sender ip
const captureSenderIp = (line) => {
    const match = line.match(/\b(\d{1,3}(?:\.\d{1,3}){3}\.\d+)\b/);
    if (match) {
        const senderIp = match[1];
        console.log('Sender IP:', senderIp); // Output: 10.0.80.234
        return senderIp
    } else {
        console.log('No sender IP found.');
    }
    return null
}

// Path to tcpdump
const tcpdumpPath = '/usr/bin/tcpdump'; // confirm with `which tcpdump`

//start the server
const startServer = () => {

    const udpSocket = dgram.createSocket({ 'type': 'udp4', reuseAddr: true })
    udpSocket.bind(5001, () => {
        channels.forEach(channel => {
            udpSocket.addMembership(channel.multicastAddress)
            console.log(udpSocket.address())
        })
    })

    udpSocket.on('message', (msg, rinfo) => {
        speed[`${rinfo.address}.${rinfo.port}`] = (speed[`${rinfo.address}.${rinfo.port}`] || 0) + msg.length
        // senderIpCleintStreamMap[`${rinfo.address}.${rinfo.port}`]?.write(msg)
        clients[`${rinfo.address}.${rinfo.port}`]?.forEach(({ res }) => {
            res?.write(msg)
        });
    })

    setInterval(() => {
        const heapStats = v8.getHeapStatistics();

        console.log('\n--- Formatted Heap Statistics ---');
        console.log('Total Heap Size:', formatBytes(heapStats.total_available_size));
        console.log('Used Heap Size:', formatBytes(heapStats.used_heap_size));
        console.log('Heap Size Limit:', formatBytes(heapStats.heap_size_limit));
        console.log('---------------------------------');
        const heapUsedMB = heapStats.used_heap_size / 1024 / 1024;
        
        // Restart if memory exceeds 400MB
        restartOnCondition(heapUsedMB > restart_threshold, `Memory usage: ${heapUsedMB.toFixed(2)}MB`);

    }, 10000);

    channels.forEach((channel, index) => {
        const filter = `udp and dst host ${channel.multicastAddress} and dst port ${channel.port}`;
        const args = ['-i', 'enp86s0', filter, '-n', '-c', '1'];

        // console.log(`Starting tcpdump for: ${filter}`);

        const tcpdump = spawn('sudo', [tcpdumpPath, ...args]);


        tcpdump.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`Packet ${index + 1}:\n${output}`);
            const senderIp = captureSenderIp(output)
            if (senderIp && !channels[index].senderIp) {
                channels[index].senderIp = senderIp;
                speed[senderIp] = 0;
                // senderIpCleintStreamMap[senderIp] = new PassThrough()
                clients[senderIp] = []
            }
            tcpdump.kill('SIGINT'); // Ensure it ends even if -c fails
        });

        tcpdump.stderr.on('data', (data) => {
            // console.error(`stderr [${index + 1}]: ${data}`);
        });

        tcpdump.on('close', (code) => {
            // console.log(`tcpdump [${index + 1}] exited with code ${code}`);
        });

        let totalClents = 0
        app.get(`/stream/${index + Number(start) + 1}.ts`, (req, res) => {
            // res.setHeader("Content-Type", "video/MP2T");
            res.writeHead(200, {
                "Content-Type": "video/MP2T",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
              });
            console.log('client connected', channel.name);
            // const bufferStream = new PassThrough()
            // const clientStream = senderIpCleintStreamMap[channel.senderIp]
            // clientStream.pipe(res)
            const clientData = {
                res, id: totalClents
            }
            clients[channel.senderIp]?.push(clientData)
            totalClents++;

            req.on('close', () => {
                console.log('cleint close for ', clientData.id)
                totalClents--;
                // Remove client from list
                const index = clients[channel.senderIp]?.indexOf(clientData);
                console.log(index)
                if (index !== -1) clients[channel.senderIp].splice(index, 1);

            })
            // bufferStream.pipe(clientStream).pipe(res)

        })

        app.get(`/home${index + 1 + Number(start)}`, (req, res) => {
            res.send(`server is listinign - ${channel.name} --> ${channel.multicastAddress} ---> http://10.0.80.2:${PORT}/stream${index + 1 + + Number(start)}.ts`)
        })


    })


    app.get("/monitor", (req, res) => {
        const rows = channels.map((channel, index) => {
            const { name, multicastAddress, port, senderIp } = channel;
            const streamUrl = `/stream/${index+1}.ts`;
            const totalClient = (clients[channel.senderIp] || []).length
            const totalBytes = speed[channel.senderIp] || 0
            const bitsPerSecond = totalBytes * 8;
            const channelSpeed = (bitsPerSecond / 3_000_000).toFixed(3);
            const status = totalBytes ? 'Active' : 'In-Active';
            speed[channel.senderIp] = 0
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${name}</td>
              <td>${multicastAddress}</td>
              <td>${port}</td>
              <td>${senderIp}</td>
              <td>${status}</td>
              <td>${channelSpeed} mbps</td>
              <td>${totalClient}</td>
            </tr>`;
        }).join("");
      
        res.send(`
          <html>
            <head>
              <title>Channel Dashboard</title>
              <style>
                body { font-family: sans-serif; padding: 20px; }
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
                th { background: #333; color: white; }
              </style>
            <meta http-equiv="refresh" content="3">
            </head>
            <body>
              <h1>Live Channel Monitor</h1>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Channel</th>
                    <th>Multicast</th>
                    <th>Port</th>
                    <th>Sender IP</th>
                    <th>Status</th>
                    <th>Speed</th>
                    <th>Clients</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </body>
          </html>
        `);
      });

    http.createServer(app).listen(PORT, "0.0.0.0", () => {
        console.log("server is listining - ", "all", "--->", `http://localhost:${PORT}`)
    })
}

startServer()