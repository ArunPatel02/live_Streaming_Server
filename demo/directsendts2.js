const express = require("express");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

// Paths
const hlsOutputPath = path.join(__dirname, "public/hls");
const liveTsPath = path.join(__dirname, "public", "stream.ts");

// Clean and prepare HLS output directory
if (fs.existsSync(hlsOutputPath)) {
  fs.rmSync(hlsOutputPath, { recursive: true, force: true });
}
fs.mkdirSync(hlsOutputPath, { recursive: true });

const udpStreamIp = "239.100.100.19"  //channel udp ip
const udpStreamPort = 5001 //channel udp port 
const udpStreamUrl = `udp://${udpStreamIp}:${udpStreamPort}`;

// Your FFmpeg stream-to-HLS function (simplified)
function convertStreamToHLS() {
  if (global.currentFFmpegProcess) {
    try {
      global.currentFFmpegProcess.kill();
    } catch (e) {
      console.error("Error killing FFmpeg:", e);
    }
  }

  const command = ffmpeg(udpStreamUrl)
    .inputOptions([
      "-loglevel warning",
      "-fflags +nobuffer+igndts",
      "-rtbufsize 100M",
      "-re",
    ])
    .output(path.join(hlsOutputPath, "stream.m3u8"))
    .outputOptions([
      "-c:v libx264",
      "-c:a aac",
      "-preset veryfast",
      "-tune zerolatency",
      "-profile:v baseline",
      "-level 3.1",
      "-r 25",
      "-g 50",
      "-keyint_min 50",
      "-sc_threshold 0",
      "-b:v 3000k",
      "-maxrate 3000k",
      "-bufsize 6000k",
      "-b:a 128k",
      "-f hls",
      "-hls_time 2",
      "-hls_list_size 10",
      "-hls_flags independent_segments+program_date_time",
      "-hls_allow_cache 1",
      "-hls_segment_type mpegts",
      "-hls_segment_filename",
      path.join(hlsOutputPath, "stream-%03d.ts"),
      "-start_number 0",
      "-threads 0",
      "-movflags +faststart",
    ]);

  global.currentFFmpegProcess = command;

  command
    .on("start", (cmdLine) => {
      console.log("FFmpeg started:", cmdLine);
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err.message);
    })
    .on("end", () => {
      console.log("FFmpeg finished");
    });

  command.run();
}

convertStreamToHLS();

const app = express();
const port = 4000;

// Serve HLS directory statically
app.use("/hls", express.static(hlsOutputPath));

// Custom handler for the live-growing stream.ts file with range support
app.get("/stream.ts", (req, res) => {
  fs.stat(liveTsPath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).send("File not found");
    }

    const fileSize = stats.size;
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "video/MP2T",
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(liveTsPath).pipe(res);
      return;
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set({
        "Content-Range": `bytes */${fileSize}`,
      }).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/MP2T",
    });

    const stream = fs.createReadStream(liveTsPath, { start, end });
    stream.pipe(res);
    stream.on("error", (streamErr) => {
      console.error("Stream error:", streamErr);
      res.end();
    });
  });
});

// Simple homepage with HLS player
app.get("/", (req, res) => {
  res.send(`
    <h1>UDP to HLS Streaming</h1>
    <video width="600" controls>
      <source src="http://localhost:${port}/hls/stream.m3u8" type="application/x-mpegURL" />
      Your browser does not support HLS.
    </video>

    <h2>Raw TS stream (may not work perfectly in browser)</h2>
    <video width="600" controls>
      <source src="http://localhost:${port}/stream.ts" type="video/mp2t" />
      Your browser does not support MPEG-TS.
    </video>
  `);
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
