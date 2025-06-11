const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');
const ChannelData = require('./channels.json')



const PORT = 4001;

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
const channels = ChannelData

/**
 * @typedef {Object} ChannelStreamData
 * @property {PassThrough} clientStream - Stream to push data to the client
 * @property {boolean} isBuffering - Whether buffering is currently in progress
 * @property {number} bufferDelay - Buffer delay in seconds
 * @property {Buffer[]} pcaketBuffer - Array to store all buffered packets
 * @property {Buffer[]} oneSecondPacketBuffer - Packets stored for one second window
 * @property {number|null} startTime - Start time of buffering
 * @property {number|null} oneSecondStartTime - Start time for 1s packet buffer
 */

/** @type {Record<string, ChannelStreamData>} */
const senderIpCleintStreamMap = {}

/** @type {Record<string , Array<{res : any , id : number}>>} */
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

const udpSocket = dgram.createSocket({ 'type': 'udp4', reuseAddr: true, reusePort: true })

udpSocket.bind(5001, () => {
    channels.forEach(channel => {
        udpSocket.addMembership(channel.multicastAddress)
        // console.log(udpSocket.address())
    })
})

udpSocket.on('message', (msg, rinfo) => {
    if (senderIpCleintStreamMap[rinfo.address]) {
        const currentChannel = senderIpCleintStreamMap[rinfo.address]
        if (!currentChannel.startTime) {
            currentChannel.startTime = new Date()
        }
        if (!currentChannel.oneSecondStartTime) {
            currentChannel.oneSecondStartTime = new Date()
        }
        const currentTime = new Date()
        const diff = currentTime - currentChannel.startTime
        const oneSecondDiff = currentTime - currentChannel.oneSecondStartTime;
        if (oneSecondDiff >= 1000) {
            currentChannel.pcaketBuffer.push(currentChannel.oneSecondPacketBuffer);
            currentChannel.oneSecondPacketBuffer = [];
            currentChannel.oneSecondStartTime = null;
        }
        if (diff > currentChannel.bufferDelay * 1000) {
            currentChannel.isBuffering = false;
        }
        currentChannel.oneSecondPacketBuffer.push(msg)
    }
    // senderIpCleintStreamMap[rinfo.address]?.clientStream?.write(msg)

})

setInterval(() => {
    channels.map(channel => {
        if (channel.senderIp) {
            const currentChannel = senderIpCleintStreamMap[channel.senderIp]
            if (!currentChannel.isBuffering) {
                const buffer = currentChannel.pcaketBuffer[0]
                buffer?.map((chunk) => {
                    // currentChannel.clientStream.write(chunk)
                    clients[channel.senderIp]?.forEach(({ res }) => {
                        res?.write(msg)
                    });
                })
                currentChannel.pcaketBuffer.shift()
            }
        }
    })
}, 1000);


// channels.forEach((channel) => {
//     const app = express()

//     app.get('/stream.ts', (req, res) => {
//         res.setHeader("Content-Type", "video/MP2T");
//         console.log('client connected', channel.id);
//         const bufferStream = new PassThrough()
//         const clientStream = senderIpCleintStreamMap[channel.senderIp].clientStream
//         bufferStream.pipe(clientStream).pipe(res)

//     })


//     http.createServer(app).listen(4001, channel.ipaddress, () => {
//         console.log("server is listining", channel.ipaddress)
//     })
// })

const app = express()

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
            clients[senderIp] = []
            senderIpCleintStreamMap[senderIp] = {
                isBuffering: true,  // boolean to store is streaming
                bufferDelay: channel.bufferDelay, //in sec
                pcaketBuffer: [], //used to store the incoming the onesecondpacketbuffer array
                oneSecondPacketBuffer: [], // used to store 1 second buffer packets
                startTime: null, // start time of storing the buffer packet
                oneSecondStartTime: null, // start time for each one second buffer packet
            }
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
    app.get(`/stream${index + 1}.ts`, (req, res) => {
        res.setHeader("Content-Type", "video/MP2T");
        console.log('client connected', channel.name);
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

    })

    app.get(`/home${index + 1}`, (req, res) => {
        res.send(`server is listinign - ${channel.name} --> ${channel.multicastAddress} ---> http://10.0.80.2:${PORT}/stream${index + 1}.ts`)
    })

});

http.createServer(app).listen(PORT, "0.0.0.0", () => {
    console.log("server is listining - ", "all", "--->", `http://${"channel.ipaddress"}:${PORT}`)
})