const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');



const PORT = 4001;

const channels = [
    {
        "id": "6784a66cc2b224fb1ab3c6bc",
        "name": "WEATHER NATION",
        "multicastAddress": "239.100.100.10",
        "port": 5001,
        "ipaddress": "10.85.0.10",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6bd",
        "name": "CNN",
        "multicastAddress": "239.100.100.11",
        "port": 5001,
        "ipaddress": "10.85.0.11",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6be",
        "name": "MSNBC",
        "multicastAddress": "239.100.100.12",
        "port": 5001,
        "ipaddress": "10.85.0.12",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6bf",
        "name": "HLN",
        "multicastAddress": "239.100.100.13",
        "port": 5001,
        "ipaddress": "10.85.0.13",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c0",
        "name": "BLOOMBERG",
        "multicastAddress": "239.100.100.14",
        "port": 5001,
        "ipaddress": "10.85.0.14",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c1",
        "name": "FOX NEWS",
        "multicastAddress": "239.100.100.15",
        "port": 5001,
        "ipaddress": "10.85.0.15",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c2",
        "name": "FX",
        "multicastAddress": "239.100.100.16",
        "port": 5001,
        "ipaddress": "10.85.0.16",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c3",
        "name": "FXX",
        "multicastAddress": "239.100.100.17",
        "port": 5001,
        "ipaddress": "10.85.0.17",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c4",
        "name": "NAT GEO",
        "multicastAddress": "239.100.100.18",
        "port": 5001,
        "ipaddress": "10.85.0.18",
        "senderIp": null,
        "bufferDelay": 10 
    },
    {
        "id": "6784a66cc2b224fb1ab3c6c5",
        "name": "TBS",
        "multicastAddress": "239.100.100.19",
        "port": 5001,
        "ipaddress": "10.85.0.19",
        "senderIp": null,
        "bufferDelay": 10 
    }
]

/**
 * @typedef {Object} ChannelData
 * @property {PassThrough} clientStream - Stream to push data to the client
 * @property {boolean} isBuffering - Whether buffering is currently in progress
 * @property {number} bufferDelay - Buffer delay in seconds
 * @property {Buffer[]} pcaketBuffer - Array to store all buffered packets
 * @property {Buffer[]} oneSecondPacketBuffer - Packets stored for one second window
 * @property {number|null} startTime - Start time of buffering
 * @property {number|null} oneSecondStartTime - Start time for 1s packet buffer
 */

/** @type {Record<string, ChannelData>} */
const senderIpCleintStreamMap = {

}

const captureSenderIp = (line) => {
    const match = line.match(/IP (\d{1,3}(?:\.\d{1,3}){3})\.\d+ >/);
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

channels.forEach((channel, index) => {
    const filter = `udp and dst host ${channel.multicastAddress} and dst port ${channel.port}`;
    const args = ['-i', 'enp86s0', filter, '-n', '-c', '1'];

    console.log(`Starting tcpdump for: ${filter}`);

    const tcpdump = spawn('sudo', [tcpdumpPath, ...args]);

    tcpdump.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`Packet ${index + 1}:\n${output}`);
        const senderIp = captureSenderIp(output)
        if (senderIp && !channels[index].senderIp) {
            channels[index].senderIp = senderIp;
            senderIpCleintStreamMap[senderIp] = {
                clientStream: new PassThrough(), // store the client stream
                isBuffering: true,  // boolean to store is streaming
                bufferDelay: channel.bufferDelay || 10, //in sec
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
});

const udpSocket = dgram.createSocket({ 'type': 'udp4', reuseAddr: true })

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
                    currentChannel.clientStream.write(chunk)
                })
                currentChannel.pcaketBuffer.shift()
            }
        }
    })
}, 1000);


channels.forEach((channel) => {
    const app = express()

    app.get('/stream.ts', (req, res) => {
        res.setHeader("Content-Type", "video/MP2T");
        console.log('client connected', channel.id);
        const bufferStream = new PassThrough()
        const clientStream = senderIpCleintStreamMap[channel.senderIp].clientStream
        bufferStream.pipe(clientStream).pipe(res)

    })


    http.createServer(app).listen(4001, channel.ipaddress, () => {
        console.log("server is listining", channel.ipaddress)
    })
})
