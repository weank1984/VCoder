
const { spawn } = require('child_process');

const claudePath = 'claude'; // Assuming in PATH

// No -p, plain text input default
const args = [
    '--output-format', 'stream-json',
    '--verbose'
];

console.log('Spawning claude (REPL) with:', args.join(' '));

const child = spawn(claudePath, args, {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
        ...process.env,
        TERM: 'xterm-256color',
    }
});

child.stderr.on('data', (data) => {
    console.error(`[STDERR]: ${data}`);
});

child.stdout.on('data', (data) => {
    console.log(`[STDOUT]: ${data}`);
});

child.on('close', (code) => {
    console.log(`[EXIT] Code: ${code}`);
});

// Send prompt as plain text
const prompt = "Please create a file named 'repro_repl.txt' with content 'repl_test'.\n";
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
