
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Resolve Claude path
const claudePath = 'claude'; // Assuming in PATH

const args = [
    '-p', '', // Empty prompt
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose',
    '--include-partial-messages'
];

console.log('Spawning claude with:', args.join(' '));

const child = spawn(claudePath, args, {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
        ...process.env,
        TERM: 'xterm-256color',
    }
});

// Setup listeners
child.stderr.on('data', (data) => {
    console.error(`[STDERR]: ${data}`);
});

child.stdout.on('data', (data) => {
    console.log(`[STDOUT]: ${data}`);
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

// Send a tool use request
const prompt = "Please create a file named 'repro_test.txt' with content 'test'.";
const userMessage = JSON.stringify({
    type: 'user',
    message: {
        role: 'user',
        content: prompt,
    },
}) + '\n';

console.log('Writing prompt to stdin...');
child.stdin.write(userMessage);

// Do NOT close stdin, wait to see if it prompts and waits
setTimeout(() => {
    console.log('Waited 5 seconds. If no permission prompt seen or process exited, then it failed.');
    // child.stdin.end(); // Don't end, keep waiting
}, 5000);

// Try to send 'y' after 7 seconds if still running
setTimeout(() => {
    console.log('Sending y...');
    child.stdin.write('y\n');
}, 7000);

// Kill after 15s
setTimeout(() => {
    console.log('Timeout. Killing.');
    child.kill();
}, 15000);
