const express = require("express");
const { spawn } = require("child_process");

const app = express();
const port = 4001;

// Your multicast or unicast UDP stream
const udpStreamUrl = "udp://239.100.100.19:5001";
// const udpStreamUrl = "udp://239.101.101.23:1234";

app.get("/stream.ts", (req, res) => {
    console.log("Client connected for direct TS stream");

    res.setHeader("Content-Type", "video/MP2T");

    const ffmpeg = spawn("ffmpeg", [
        "-i", udpStreamUrl,
        "-f", "mpegts",
        "-c", "copy",
        "-mpegts_copyts", "1",
        "-mpegts_flags", "resend_headers+system_b", // optional but can help with compatibility
        "-fflags", "+nobuffer+discardcorrupt",
        "-err_detect", "ignore_err",
        "pipe:1"
    ]);

    
    ffmpeg.stdout.on("data", (chunk) => {
        console.log("TS packet chunk size:", chunk.length);

        // Optionally inspect the first few bytes
        // console.log(chunk.slice(0, 16)); // Print header
        // Check if the chunk is a multiple of 188 bytes
        if (chunk.length % 188 !== 0) {
            console.warn("⚠️ Warning: Received chunk of size ${size}, which is not a multiple of 188");
        }

        // res.write(chunk);
    });

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on("data", (data) => {
        console.error(`FFmpeg stderr: ${data}`);
    });

    ffmpeg.on("close", (code, signal) => {
        console.log(`FFmpeg process closed, code ${code}, signal ${signal}`);
        res.end();
    });

    // Clean up on client disconnect
    req.on("close", () => {
        console.log("Client disconnected, killing FFmpeg");
        ffmpeg.kill("SIGKILL");
    });
});

app.listen(port, () => {
    console.log(`TS stream available at http://localhost:${port}/stream.ts`);
});