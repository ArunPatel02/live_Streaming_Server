const { spawn } = require('child_process');

let vlcProcesses = [];
const MAX_INSTANCES = 6;
let spawnCount = 0;

function spawnVLC() {
    // Remove dead processes from array
    vlcProcesses = vlcProcesses.filter(proc => !proc.killed);
    
    // Check if we already have 10 instances
    if (vlcProcesses.length >= MAX_INSTANCES) {
        console.log(`Already have ${MAX_INSTANCES} VLC instances running. Stopping spawn interval.`);
        clearInterval(interval);
        return;
    }
    
    spawnCount++;
    console.log(`Spawning VLC #${spawnCount} (Active: ${vlcProcesses.length + 1}/${MAX_INSTANCES}) at ${new Date().toLocaleTimeString()}`);
    
    // Spawn new VLC process
    const vlcProcess = spawn('vlc', [`http://localhost:4001/stream${spawnCount}.ts`], {
        stdio: 'inherit'
    });
    
    vlcProcess.on('error', (err) => {
        console.error(`VLC spawn error: ${err.message}`);
    });
    
    vlcProcess.on('close', (code) => {
        console.log(`VLC process #${spawnCount} exited with code ${code}`);
        // Remove from active processes array
        const index = vlcProcesses.indexOf(vlcProcess);
        if (index > -1) {
            vlcProcesses.splice(index, 1);
        }
    });
    
    // Add to active processes
    vlcProcesses.push(vlcProcess);
    
    // If we've reached max instances, clear the interval
    if (vlcProcesses.length >= MAX_INSTANCES) {
        console.log(`Reached maximum ${MAX_INSTANCES} VLC instances. Stopping spawn timer.`);
        clearInterval(interval);
    }
}

// Spawn VLC immediately
spawnVLC();

// Set interval to spawn every 5 seconds
const interval = setInterval(spawnVLC, 5000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    clearInterval(interval);
    
    // Kill all VLC processes
    vlcProcesses.forEach((proc, index) => {
        if (!proc.killed) {
            proc.kill();
            console.log(`Killed VLC process #${index + 1}`);
        }
    });
    
    process.exit(0);
});