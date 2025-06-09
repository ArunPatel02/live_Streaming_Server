const express = require("express");
const dgram = require("dgram");
const http = require("http");
const { PassThrough } = require("stream");
const { spawn } = require('child_process');
const ChannelData = require('./channels.json')

const interfaceName = 'enp86s0';

//check whether ip is assign or not
const checkIp = async (ipToCheck) => {
    return new Promise((resolve, reject) => {
        const cmd = spawn('sh', ['-c', `ip addr show dev ${interfaceName} | grep '${ipToCheck}'`]);

        let output = '';

        cmd.stdout.on('data', (data) => {
            output += data.toString();
        });

        cmd.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            reject(`checkIp error : ${data}`)
        });

        cmd.on('close', (code) => {
            if (output.includes(ipToCheck)) {
                console.log(`${ipToCheck} is assigned to ${interfaceName}`);
                resolve(true)
            } else {
                console.log(`${ipToCheck} is NOT assigned to ${interfaceName}`);
                resolve(false)
            }
        });
    })
}

//create ip
const CreateIp = async (ipaddress) => {
    return new Promise((resolve, reject) => {

        // The command and arguments
        const command = 'sudo';
        const args = ['ip', 'addr', 'add', `${ipaddress}/16`, 'dev', interfaceName];

        // Spawn the process
        const removeIP = spawn(command, args, { stdio: 'inherit' });

        removeIP.on('error', (err) => {
            console.error(`Error running command: ${err.message}`);
            reject(`Error running command: ${err.message}`)
        });

        removeIP.on('exit', (code) => {
            if (code === 0) {
                console.log(ipaddress, '--> IP address added successfully.');
                resolve('IP address added successfully.')
            } else {
                console.error(ipaddress, `--> Process exited with code ${code}`);
                reject(`Process exited with code ${code}`)
            }
        });

    })
}

const PORT = 4001;
const networkId = '10.85.0.'
const startHostId = 10

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

const senderIpCleintStreamMap = {

}

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
        senderIpCleintStreamMap[`${rinfo.address}.${rinfo.port}`]?.write(msg)
    })

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
                senderIpCleintStreamMap[senderIp] = new PassThrough()
            }
            tcpdump.kill('SIGINT'); // Ensure it ends even if -c fails
        });

        tcpdump.stderr.on('data', (data) => {
            // console.error(`stderr [${index + 1}]: ${data}`);
        });

        tcpdump.on('close', (code) => {
            // console.log(`tcpdump [${index + 1}] exited with code ${code}`);
        });


        

        app.get(`/stream${index+1}.ts`, (req, res) => {
            res.setHeader("Content-Type", "video/MP2T");
            console.log('client connected', channel.name);
            const bufferStream = new PassThrough()
            const clientStream = senderIpCleintStreamMap[channel.senderIp]
            bufferStream.pipe(clientStream).pipe(res)

        })

        app.get(`/home${index+1}`, (req, res) => {
            res.send(`server is listinign - ${channel.name} --> ${channel.multicastAddress} ---> http://10.0.80.2:${PORT}/stream${index+1}.ts`)
        })


    })
    http.createServer(app).listen(PORT, "0.0.0.0", () => {
        console.log("server is listining - ", "all" , "--->", `http://${"channel.ipaddress"}:${PORT}`)
    })
}

const pushChannel = async (channel, index) => {
    const ip = `${networkId}${startHostId + index}`
    try {
        const ipToCheck = await checkIp(ip)
        if (!ipToCheck) {
            await CreateIp(ip)
            return ip
        }
        channels[index] = { ...channel, ipaddress: ip, senderIp: null, clientStream: new PassThrough() }
        return ip
    } catch (error) {
        console.log(ip, " ---> ", error)
        throw new Error(error)
    }
}

startServer()

// Promise.all(ChannelData.map(pushChannel)).catch(error => {
//     console.log("push channel error : ", error)
// }).finally(() => {
//     // console.log("push channel completed : ", channels)
//     startServer()
// })