const express = require("express");
const dgram = require("dgram");
const ffi = require("ffi-napi");

const MULTICAST_ADDR = "239.100.100.5";
const UDP_PORT = 5001;

const HTTP_PORT = 4001;

const TS_PACKET_SIZE = 188
const udpServer = dgram.createSocket({ type: "udp4", reuseAddr: true });

const pimInstance = ffi.Library("./pim/libpimdec-x86_64.so", {
    pim_init: ["int", ["void"]],
    pim_custom_init: ["int", ["int"]],
    pim_set_pmt_pid: ["int", ["int"]],
    pim_set_key: ["int", ["string"]],
    pim_status: ["int", []],
    pim_decode: ["int", ["pointer", "int"]],
    pim_diag: ["int", []],
});

function startStreaming() {
    function decryptBuffer(buffer) {
        const original = Buffer.from(buffer);
        const result = pimInstance.pim_decode(buffer, buffer.length);

        if (result === 0) {
            if (Buffer.compare(original, buffer) === 0) {
                console.error("Decryption failed, did not modify the buffer!");
            } else {
                console.log("Decryption modified the buffer successfully.");
            }
            return buffer;
        } else {
            console.error("Decryption failed with error code:", result);
            return Buffer.alloc(0); // Return an empty buffer if decryption failed
        }
    }

    udpServer.on("listening", () => {
        udpServer.setBroadcast(true);
        udpServer.setMulticastTTL(128);
        udpServer.addMembership(MULTICAST_ADDR);
        console.log(`Listening for UDP multicast on ${MULTICAST_ADDR}:${UDP_PORT}`);
    });

    udpServer.on("message", (msg, rinfo) => {
        const decryptedBuffer = decryptBuffer(msg);
        if (decryptedBuffer.length > 0) {
            // Process the decrypted buffer (e.g., save to file, stream, etc.)
            console.log(`Received and decrypted message from ${rinfo.address}:${rinfo.port}`);
        }
    });

    udpServer.bind(UDP_PORT);
}

function pmInit() {
    // console.log(pimInstance)
    const initVal = pimInstance.pim_custom_init(0);
    // console.log({ initVal })
    if (initVal === 0) {
        const setKeyVal = pimInstance.pim_set_key(
            "41ed161791130d8252dd5516c28a405ea5b640ad887e1126fca0918baf961482"
        );
        // console.log({ setKeyVal })
        if (setKeyVal === 0) {
            const pimPID = pimInstance.pim_set_pmt_pid(1234);
            console.log({ pimPID });
            const pimStatus = pimInstance.pim_status();
            console.log({ pimStatus });
            if (pimStatus === 0) {
                startStreaming();
            }
        }
    }
}

pmInit()