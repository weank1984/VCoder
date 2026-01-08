
const { spawn } = require('child_process');

// REPL mode (no -p)
const claudeArgs = [
    'claude',
    '--output-format', 'stream-json',
    '--verbose'
];

// Python script to spawn claude in a PTY
const pythonScript = `
import pty
import sys
import os

# Arguments passed to pty.spawn must be a list of strings
cmd = ${JSON.stringify(claudeArgs)}
pty.spawn(cmd)
`;

console.log('Spawning python pty wrapper (REPL)...');

const child = spawn('python3', ['-c', pythonScript], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
        ...process.env,
        TERM: 'xterm-256color',
    }
});

let buffer = '';

child.stderr.on('data', (data) => {
    // In PTY, stderr might differ or be merged, but let's log it
    console.error(`[STDERR]: ${data}`);
});

child.stdout.on('data', (data) => {
    const text = data.toString();
    console.log(`[STDOUT_RAW]: ${JSON.stringify(text)}`);
    // PTY output often comes in chunks with \r\n
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

// Send prompt
const prompt = "Please create a file named 'repro_pty_repl.txt' with content 'pty_repl_test'.\n";
// Wait 1s for shell to start
setTimeout(() => {
    console.log('Writing prompt to stdin...');
    child.stdin.write(prompt);
}, 1000);

// Wait for permission prompt
setTimeout(() => {
    console.log('Sending y...');
    child.stdin.write('y\n');
}, 5000);

// Kill after 15s
setTimeout(() => {
    console.log('Timeout. Killing.');
    child.kill();
}, 15000);
