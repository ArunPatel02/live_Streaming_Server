const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');
const ChannelData = require('./channels.json')
const v8 = require('v8');

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
const end = process.env.end || 60;

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

    const udpSocket = dgram.createSocket({ 'type': 'udp4', reuseAddr: true, reusePort: true })
    udpSocket.bind(5001, () => {
        channels.forEach(channel => {
            udpSocket.addMembership(channel.multicastAddress)
            console.log(udpSocket.address())
        })
    })

    udpSocket.on('message', (msg, rinfo) => {
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
            res.setHeader("Content-Type", "video/MP2T");
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
    http.createServer(app).listen(PORT, "0.0.0.0", () => {
        console.log("server is listining - ", "all", "--->", `http://localhost:${PORT}`)
    })
}

startServer()