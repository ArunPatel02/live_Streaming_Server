const express = require("express");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { Transform } = require("stream");

const app = express();
const port = 4001;
const udpStreamUrl = "udp://239.100.100.19:5001";

// Align TS packets to 188 bytes
class TSAligner extends Transform {
  constructor() {
    super();
    this.leftover = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    const buffer = Buffer.concat([this.leftover, chunk]);
    const packetSize = 188;
    const validLength = buffer.length - (buffer.length % packetSize);
    const alignedBuffer = buffer.slice(0, validLength);
    this.leftover = buffer.slice(validLength);
    this.push(alignedBuffer);
    callback();
  }
}

app.get("/stream.ts", (req, res) => {
  console.log("Client connected for TS stream");
  res.setHeader("Content-Type", "video/MP2T");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const tsAligner = new TSAligner();
  let ffmpegCommand = null;

  try {
    ffmpegCommand = ffmpeg(udpStreamUrl)
      .inputOptions([
        "-fflags +nobuffer"
      ])
      .outputOptions([
        "-c copy",
        "-f mpegts",
        "-mpegts_copyts 1",
        "-mpegts_flags resend_headers+system_b",
        "-err_detect ignore_err",
        "-segment_time 10"
      ])
      .on("start", commandLine => {
        console.log("FFmpeg started:", commandLine);
      })
      .on("stderr", stderrLine => {
        console.error("FFmpeg stderr:", stderrLine);
      })
      .on("error", (err, stdout, stderr) => {
        console.error("FFmpeg error:", err.message);
        if (ffmpegCommand) {
          ffmpegCommand.kill();
        }
      })
      .on("end", () => {
        console.log("FFmpeg streaming ended");
      });

    ffmpegCommand.pipe(tsAligner);
    tsAligner.pipe(res);

  } catch (err) {
    console.error("Error setting up FFmpeg:", err);
    res.status(500).send("Error setting up stream");
    return;
  }

  req.on("close", () => {
    console.log("Client disconnected");
    if (ffmpegCommand) {
      try {
        ffmpegCommand.kill();
      } catch (err) {
        console.error("Error killing FFmpeg process:", err);
      }
    }
    tsAligner.end();
  });

  res.on("end", () => {
    if (ffmpegCommand) {
      try {
        ffmpegCommand.kill();
      } catch (err) {
        console.error("Error killing FFmpeg process:", err);
      }
    }
  });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Internal server error");
});

process.on('SIGINT', () => {
  console.log("Server shutting down...");
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/stream.ts`);
});
