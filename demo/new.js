const express = require("express");
const { spawn } = require("child_process");
const { Transform } = require("stream");

const app = express();
const port = 4001;
// const udpStreamUrl = "udp://239.100.100.11:5001";
const udpStreamUrl = "udp://239.101.101.23:1234";

class TSAligner extends Transform {
  constructor(packetSize = 188) {
    super();
    this.packetSize = packetSize;
    this.leftover = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    let buffer = Buffer.concat([this.leftover, chunk]);
    const alignedLength = buffer.length - (buffer.length % this.packetSize);
    const alignedChunk = buffer.slice(0, alignedLength);
    this.leftover = buffer.slice(alignedLength);

    // Log final aligned chunk size
    console.log("Sending aligned chunk size:", alignedChunk.length, ", Is multiple of 188:", alignedChunk.length % 188 === 0);

    this.push(alignedChunk);
    callback();
  }

  _flush(callback) {
    // Pad the leftover if needed (optional)
    if (this.leftover.length > 0) {
      const padding = Buffer.alloc(this.packetSize - this.leftover.length);
      const finalChunk = Buffer.concat([this.leftover, padding]);
      this.push(finalChunk);
    }
    callback();
  }
}

app.get("/stream.ts", (req, res) => {
  console.log("Client connected for aligned TS stream");
  res.setHeader("Content-Type", "video/MP2T");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  const ffmpeg = spawn("ffmpeg", [
    "-i", udpStreamUrl,
    "-f", "mpegts",
    "-c", "copy",
    "-fflags", "+nobuffer+discardcorrupt",
    "-err_detect", "ignore_err",
    "pipe:1"
  ]);

  const tsAligner = new TSAligner();
  ffmpeg.stdout.pipe(tsAligner).pipe(res);

  ffmpeg.stderr.on("data", (data) => {
    console.error(`FFmpeg stderr: ${data}`);
  });

  ffmpeg.on("close", (code, signal) => {
    console.log(`FFmpeg process closed, code ${code}, signal ${signal}`);
    res.end();
  });

  req.on("close", () => {
    console.log("Client disconnected, killing FFmpeg");
    ffmpeg.kill("SIGKILL");
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/stream.ts`);
});