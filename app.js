const express = require("express");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const { Transform } = require("stream");
const { Buffer } = require("buffer");

// Path to save the HLS files
const hlsOutputPath = path.join(__dirname, "public/hls");

// Create the output directory if it doesn't exist
if (!fs.existsSync(hlsOutputPath)) {
    fs.mkdirSync(hlsOutputPath, { recursive: true });
}

const udpStreamUrl = "udp://239.100.100.19:5001"; // Your input stream URL
const TS_PACKET_SIZE = 188;

class DecryptedDataSourceWithNewBuffer extends Transform {
    constructor(demo1, bufferMultiplier) {
        super();

        this.demo1 = demo1; // Decryption handler
        this.bufferMultiplier = bufferMultiplier; // Buffer multiplier
        this.bufferSize = TS_PACKET_SIZE * this.bufferMultiplier; // Calculate buffer size
        this.decryptedBuffer = Buffer.alloc(0); // Buffer for decrypted data
        this.leftover = null; // Leftover data
    }

    _transform(chunk, encoding, callback) {
        let combinedData = chunk;

        // Prepend leftover data if exists
        if (this.leftover && this.leftover.length > 0) {
            combinedData = Buffer.concat([this.leftover, chunk]);
            this.leftover = null;
        }

        // Find the first TS sync byte (0x47)
        const firstSyncIndex = combinedData.indexOf(0x47);

        if (firstSyncIndex < 0) {
            console.log("No TS sync byte found in the data block.");
            this.leftover = combinedData; // Store as leftover
            return callback();
        }

        // Align data to the first sync byte
        combinedData = combinedData.slice(firstSyncIndex);

        const completePacketsCount = Math.floor(combinedData.length / TS_PACKET_SIZE);
        const completeBytesLength = completePacketsCount * TS_PACKET_SIZE;

        if (completeBytesLength === 0) {
            this.leftover = combinedData;
            return callback();
        }

        const completeData = combinedData.slice(0, completeBytesLength);
        this.leftover = combinedData.slice(completeBytesLength);

        try {
            const decryptedData = this.demo1.decodeBytes(completeData);
            this.decryptedBuffer = Buffer.concat([this.decryptedBuffer, decryptedData]);
        } catch (e) {
            console.error("Decryption error:", e);
            return callback(e); // Propagate error if decryption fails
        }

        this.push(this.decryptedBuffer);
        this.decryptedBuffer = Buffer.alloc(0);

        callback();
    }

    close() {
        this.decryptedBuffer = Buffer.alloc(0);
        this.leftover = null;
    }
}

// Example demo1 object with a simple decodeBytes method
const demo1 = {
    decodeBytes: (data) => {
      return data;
    }
};

// Start the conversion from UDP stream to HLS with decryption
const convertStreamToHLS = () => {
    const command = ffmpeg(udpStreamUrl)
        .output(path.join(hlsOutputPath, "stream.m3u8"))
        .outputOptions([
            "-loglevel debug",
            "-c:v libx264",
            "-c:a aac",
            "-crf 20",
            "-b:v 3000k",
            "-filter:v transpose=1",
            "-map_metadata 0",
            "-f hls",
            "-hls_time 5",
            "-hls_list_size 10",
            "-hls_flags delete_segments",
            "-start_number 1",
            "-segment_format mpegts",
            path.join(hlsOutputPath, "stream-%03d.ts"),
        ])
        .on("start", (commandLine) => {
            // FFmpeg command started
        })
        .on("error", (err, stdout, stderr) => {
            console.error("Error occurred:", err.message);
            console.error("FFmpeg stderr:", stderr);
        })
        .on("end", () => {
            console.log("Stream conversion completed");
        })
        .run();

    // Watch the output folder for new .ts segments
    fs.watch(hlsOutputPath, (eventType, filename) => {
        if (filename && filename.endsWith(".ts") && eventType === "rename" && !filename.includes("%03d")) {
            const tsFilePath = path.join(hlsOutputPath, filename);

            if (fs.existsSync(tsFilePath)) {
                console.log(`New segment detected: ${filename}`);

                // Read the encrypted TS file
                fs.readFile(tsFilePath, (err, data) => {
                    if (err) {
                        console.error(`Error reading ${filename}:`, err);
                        return;
                    }

                    if (data.length % TS_PACKET_SIZE !== 0 || data[0] !== 0x47) {
                        console.error(`Invalid TS segment: ${filename}`);
                        return;
                    }

                    // Decrypt the buffer using the demo1 object
                    const decryptedBuffer = new DecryptedDataSourceWithNewBuffer(demo1, 22);
                    decryptedBuffer.write(data);
                    decryptedBuffer.end();

                    decryptedBuffer.on("data", (decryptedData) => {
                        console.log({ decryptedData });
                        fs.writeFile(tsFilePath, decryptedData, (err) => {
                            if (err) {
                                console.error(`Error saving decrypted ${filename}:`, err);
                            } else {
                                console.log(`Decrypted segment saved: ${filename}`);
                            }
                        });
                    });

                    decryptedBuffer.on("error", (err) => {
                        console.error("Error during decryption:", err);
                    });
                });
            }
        }
    });
};

convertStreamToHLS()

// Run the stream conversion to HLS
// convertStreamToHLS();

const app = express()
const port = 4000

// Serve the HLS content via Express
app.use("/hls", express.static(hlsOutputPath));

// Home route
app.get("/", (req, res) => {
    res.send(`
      <video id=example-video width=600 height=300 class="video-js vjs-default-skin" controls>
  <source
     src="http://localhost:${port}/hls/stream.m3u8"
     type="application/x-mpegURL">
</video>
<script src="video.js"></script>
<script src="videojs-contrib-hls.min.js"></script>
<script>
var player = videojs('example-video');
player.play();
</script>
    <h1>UDP to HLS Streaming</h1>
    <p>Click below to play the HLS stream:</p>
    <video width="600" controls>
      <source src="http://localhost:${port}/hls/stream.m3u8" type="application/x-mpegURL">
      Your browser does not support the video tag.
    </video>
  `);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
