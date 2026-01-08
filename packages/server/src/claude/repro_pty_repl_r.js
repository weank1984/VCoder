
const { spawn } = require('child_process');

const claudeArgs = [
    'claude',
    '--output-format', 'stream-json',
    '--verbose'
];

const pythonScript = `
import pty
import sys
import os

# Arguments passed to pty.spawn must be a list of strings
cmd = ${JSON.stringify(claudeArgs)}
pty.spawn(cmd)
`;

console.log('Spawning python pty wrapper (REPL + \\r)...');

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
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

const prompt = "Please create a file named 'repro_pty_r.txt' with content 'pty_r_test'.\r"; 
// Using \r

setTimeout(() => {
    console.log('Writing prompt to stdin (with \\r)...');
    child.stdin.write(prompt);
}, 2000);

setTimeout(() => {
    console.log('Sending y...');
    child.stdin.write('y\r');
}, 10000);

setTimeout(() => {
    console.log('Timeout. Killing.');
    child.kill();
}, 20000);
