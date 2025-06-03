const express = require("express");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

// Path to save the HLS files
const hlsOutputPath = path.join(__dirname, "public/hls");

// Create the output directory if it doesn't exist
if (!fs.existsSync(hlsOutputPath)) {
    fs.mkdirSync(hlsOutputPath, { recursive: true });
}

const udpStreamIp = "239.100.100.19"  //channel udp ip
const udpStreamPort = 5001 //channel udp port 
const udpStreamUrl = `udp://${udpStreamIp}:${udpStreamPort}`; // Your input stream URL
const TS_PACKET_SIZE = 188;

// Add buffer delay configuration
const BUFFER_DELAY_SECONDS = 10; //buffer delay seconds 
const SEGMENT_DURATION = 2; // HLS segment duration in seconds
const MAX_SEGMENTS_TO_KEEP = Math.ceil(BUFFER_DELAY_SECONDS / SEGMENT_DURATION) + 2; // Keep buffer + 2 extra segments

// Modify the UDP stream health check
const checkUDPStream = () => {
    const dgram = require('dgram');
    let client = null;
    let healthCheckInterval = null;
    let isRunning = false;

    const startUDPClient = () => {
        if (client) {
            try {
                client.close();
            } catch (e) {
                console.log('Error closing existing client:', e);
            }
        }

        client = dgram.createSocket({
            type: 'udp4',
            reuseAddr: true // Allow address reuse
        });
        
        client.on('error', (err) => {
            console.error('UDP socket error:', err);
            if (err.code === 'EADDRINUSE') {
                console.log('Port in use, retrying with different port...');
                setTimeout(startUDPClient, 1000);
            } else {
                restartUDPClient();
            }
        });

        client.on('close', () => {
            console.log('UDP socket closed');
            isRunning = false;
            if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
                healthCheckInterval = null;
            }
        });

        // Try to bind to a random available port
        const bindToPort = (port) => {
            try {
                client.bind(port, () => {
                    console.log(`UDP socket bound to port ${port}`);
                    client.setBroadcast(true);
                    client.setMulticastTTL(128);
                    client.addMembership(udpStreamIp);
                    isRunning = true;
                    startHealthCheck();
                });
            } catch (err) {
                if (err.code === 'EADDRINUSE') {
                    // Try next port
                    bindToPort(port + 1);
                } else {
                    console.error('Error binding UDP socket:', err);
                    restartUDPClient();
                }
            }
        };

        // Start with port 5001, will try next ports if in use
        bindToPort(udpStreamPort);
    };

    const startHealthCheck = () => {
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
        }

        let lastDataTime = Date.now();
        
        client.on('message', () => {
            lastDataTime = Date.now();
        });

        healthCheckInterval = setInterval(() => {
            if (!isRunning) {
                console.log('UDP client not running, restarting...');
                restartUDPClient();
                return;
            }

            const now = Date.now();
            if (now - lastDataTime > 5000) { // No data for 5 seconds
                console.log('UDP stream appears to be down, attempting restart...');
                restartUDPClient();
            }
        }, 1000);
    };

    const restartUDPClient = () => {
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
        }

        if (client) {
            try {
                client.close();
            } catch (e) {
                console.log('Error closing client during restart:', e);
            }
        }

        setTimeout(() => {
            console.log('Restarting UDP client...');
            startUDPClient();
        }, 1000);
    };

    // Start the UDP client
    startUDPClient();

    // Return cleanup function
    return {
        stop: () => {
            if (healthCheckInterval) {
                clearInterval(healthCheckInterval);
                healthCheckInterval = null;
            }
            if (client) {
                try {
                    client.close();
                } catch (e) {
                    console.log('Error closing client during cleanup:', e);
                }
                client = null;
            }
            isRunning = false;
        }
    };
};

// Modify the convertStreamToHLS function
const convertStreamToHLS = () => {
    if (global.currentFFmpegProcess) {
        try {
            global.currentFFmpegProcess.kill();
        } catch (e) {
            console.log('Error killing existing FFmpeg process:', e);
        }
    }

    const command = ffmpeg(udpStreamUrl)
        .inputOptions([
            "-loglevel warning",
            "-analyzeduration 5000000",
            "-probesize 5000000",
            "-fflags +nobuffer+igndts",
            "-rtbufsize 100M",
            "-max_delay 500000",
            "-thread_queue_size 1024",
            "-re", // Read input at native frame rate
        ])
        .output(path.join(hlsOutputPath, "stream.m3u8"))
        .outputOptions([
            // Basic settings
            "-c:v libx264",
            "-c:a aac",
            "-f hls",
            // HLS settings with buffer delay
            `-hls_time ${SEGMENT_DURATION}`,
            `-hls_list_size ${MAX_SEGMENTS_TO_KEEP}`,
            "-hls_flags delete_segments+append_list+independent_segments+program_date_time",
            "-hls_segment_type mpegts",
            "-hls_segment_filename", path.join(hlsOutputPath, "stream-%03d.ts"),
            // Add start time offset for buffer delay
            `-start_number 0`,
            // Video settings
            "-preset veryfast",
            "-tune zerolatency",
            "-profile:v main",
            "-level 4.0",
            "-b:v 4000k",
            "-maxrate 4000k",
            "-bufsize 8000k",
            "-g 25",
            "-keyint_min 25",
            "-sc_threshold 0",
            "-r 25",
            // Audio settings
            "-b:a 128k",
            // Error resilience
            "-err_detect ignore_err",
            // Additional optimizations
            "-threads 0",
            "-movflags +faststart",
        ]);

    // Store the FFmpeg process
    global.currentFFmpegProcess = command;

    // Add segment cleanup monitoring
    let lastCleanupTime = Date.now();
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastCleanupTime >= 5000) { // Check every 5 seconds
            cleanupOldSegments();
            lastCleanupTime = now;
        }
    }, 5000);

    command.on("start", (commandLine) => {
        console.log("FFmpeg started with command:", commandLine);
    })
    .on("error", (err, stdout, stderr) => {
        console.error("FFmpeg error:", err.message);
        if (stderr) console.error("FFmpeg stderr:", stderr);
        clearInterval(cleanupInterval);
        cleanupAndRestart();
    })
    .on("end", () => {
        console.log("Stream conversion completed");
        clearInterval(cleanupInterval);
        cleanupAndRestart();
    });

    try {
        command.run();
    } catch (error) {
        console.error("Failed to start FFmpeg:", error);
        clearInterval(cleanupInterval);
        cleanupAndRestart();
    }
};

// Add function to clean up old segments
const cleanupOldSegments = () => {
    fs.readdir(hlsOutputPath, (err, files) => {
        if (err) {
            console.error("Error reading directory:", err);
            return;
        }

        // Sort files by name to ensure correct order
        const tsFiles = files
            .filter(file => file.endsWith('.ts'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0]);
                const numB = parseInt(b.match(/\d+/)[0]);
                return numA - numB;
            });

        // Keep only the most recent segments
        const segmentsToKeep = tsFiles.slice(-MAX_SEGMENTS_TO_KEEP);
        const segmentsToDelete = tsFiles.filter(file => !segmentsToKeep.includes(file));

        // Delete old segments
        segmentsToDelete.forEach(file => {
            fs.unlink(path.join(hlsOutputPath, file), err => {
                if (err) console.error(`Error deleting old segment ${file}:`, err);
            });
        });

        // Update m3u8 file to reflect current segments
        if (segmentsToKeep.length > 0) {
            const m3u8Content = [
                '#EXTM3U',
                '#EXT-X-VERSION:3',
                '#EXT-X-TARGETDURATION:2',
                '#EXT-X-MEDIA-SEQUENCE:' + parseInt(segmentsToKeep[0].match(/\d+/)[0]),
                ...segmentsToKeep.map(file => `#EXTINF:${SEGMENT_DURATION}.0,`),
                ...segmentsToKeep.map(file => file)
            ].join('\n') + '\n';

            fs.writeFile(path.join(hlsOutputPath, 'stream.m3u8'), m3u8Content, err => {
                if (err) console.error('Error updating m3u8 file:', err);
            });
        }
    });
};

// Start UDP health check
const udpClient = checkUDPStream();

// Clean up on exit
process.on('SIGINT', () => {
    console.log('Cleaning up...');
    if (udpClient) {
        udpClient.stop();
    }
    if (global.currentFFmpegProcess) {
        try {
            global.currentFFmpegProcess.kill();
        } catch (e) {
            console.log('Error killing FFmpeg process:', e);
        }
    }
    process.exit();
});

// Start the stream
convertStreamToHLS();

const app = express()
const hostName =  "172.32.215.34" // your local ip
const port = 4000 //port in which server run

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

app.listen(port , hostName, () => {
    console.log(`Server is running on http://${hostName}:${port}`);
});
