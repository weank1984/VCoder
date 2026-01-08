
const { spawn } = require('child_process');

// Construct the python PTY wrapper command
const claudeArgs = [
    'claude',
    '-p', '', // Empty prompt
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages'
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

console.log('Spawning python pty wrapper...');

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
    // Try to find JSON lines
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line
    for (const line of lines) {
        // PTY adds \r, remove it
        const cleanLine = line.trim(); 
        if (cleanLine.startsWith('{')) {
            console.log(`[JSON]: ${cleanLine}`);
        } else {
             console.log(`[TEXT]: ${cleanLine}`);
        }
    }
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

// Send prompt
// Note: In -p mode, we need to send the prompt? 
// Wait, -p "" means prompt is empty.
// We passed -p "" in args.
// So claude starts, processes empty prompt?
// Actually we want to send the prompt via stdin.
// But we are in Text mode (default).
// So we just send text "Create..."
const prompt = "Please create a file named 'repro_pty.txt' with content 'pty_test'.\n";
console.log('Writing prompt to stdin...');
child.stdin.write(prompt);

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
