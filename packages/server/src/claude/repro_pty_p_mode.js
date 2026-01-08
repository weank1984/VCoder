
const { spawn } = require('child_process');

const prompt = "Please create a file named 'repro_pty_p.txt' with content 'pty_p_test'.";

const claudeArgs = [
    'claude',
    '-p', prompt, 
    '--output-format', 'stream-json',
    '--verbose'
];

const pythonScript = `
import pty
import sys
import os

cmd = ${JSON.stringify(claudeArgs)}
pty.spawn(cmd)
`;

console.log('Spawning python pty wrapper (-p mode)...');

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
    console.error(`[STDERR]: ${data}`);
});

child.stdout.on('data', (data) => {
    const text = data.toString();
    console.log(`[STDOUT_RAW]: ${JSON.stringify(text)}`);
    buffer += text;
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

// We expect it to run, ask for permission, and wait.
// We DO NOT close stdin.

setTimeout(() => {
    console.log('Sending y...');
    child.stdin.write('y\r');
}, 5000);

// Kill after 15s
setTimeout(() => {
    console.log('Timeout. Killing.');
    child.kill();
}, 15000);
