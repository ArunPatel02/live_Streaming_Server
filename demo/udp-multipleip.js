const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');



const PORT = 4001;

const channels = [
    {
        id: "channel1",
        multicastAddress: "239.100.100.19",
        port: 5001,
        ipaddress: "172.32.215.34",
        senderIp : null,
        clientStream: new  PassThrough(),
    },
    {
        id: "channel2",
        multicastAddress: "239.100.100.11",
        port: 5001,
        ipaddress: "172.32.215.35",
        senderIp : null,
        clientStream : new PassThrough()
    },
]

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
        if(senderIp && !channels[index].senderIp){
            channels[index].senderIp = senderIp;
            senderIpCleintStreamMap[senderIp] = new PassThrough()
        }
        tcpdump.kill('SIGINT'); // Ensure it ends even if -c fails
    });

    tcpdump.stderr.on('data', (data) => {
        console.error(`stderr [${index + 1}]: ${data}`);
    });

    tcpdump.on('close', (code) => {
        console.log(`tcpdump [${index + 1}] exited with code ${code}`);
    });
});

const udpSocket = dgram.createSocket({ 'type': 'udp4', reuseAddr: true, reusePort: true })

udpSocket.bind(5001, () => {
    channels.forEach(channel => {
        udpSocket.addMembership(channel.multicastAddress)
        // console.log(udpSocket.address())
    })
})

udpSocket.on('message', (msg, rinfo) => {
    const seqNum = msg.readUInt32BE(0);
    senderIpCleintStreamMap[rinfo.address]?.write(msg)
    // channels.forEach((channel , index)=>{
    //     if(channel.senderIp === rinfo.address){
    //         channels[index].clientStream.write(msg)
    //     }
    // })
})


channels.forEach((channel)=>{
    const app = express()

    app.get('/stream.ts', (req, res) => {
        res.setHeader("Content-Type", "video/MP2T");
        console.log('client connected' , channel.id);
        const bufferStream = new PassThrough()
        const clientStream = senderIpCleintStreamMap[channel.senderIp]
        bufferStream.pipe(clientStream).pipe(res)
    
    })
    
    
    http.createServer(app).listen(4001, channel.ipaddress, () => {
        console.log("server is listining" , channel.ipaddress)
    })
})
