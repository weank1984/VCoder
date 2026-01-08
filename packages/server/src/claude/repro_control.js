
const { spawn } = require('child_process');

const claudePath = 'claude';

// Using stream-json input to enable sending JSON
const args = [
    '-p', '', 
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose'
];

console.log('Spawning claude (Control msg test) with:', args.join(' '));

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

const prompt = "Please create a file named 'repro_control.txt' with content 'control_test'.";
const userMessage = JSON.stringify({
    type: 'user',
    message: {
        role: 'user',
        content: prompt,
    },
}) + '\n';

child.stdin.write(userMessage);

// Try various control messages
const attempts = [
    { type: 'control', control: 'permission_response', accepted: true },
    { type: 'control', subtype: 'permission', accepted: true },
    { type: 'control', action: 'approve' },
    { type: 'control', signal: 'continue' },
    { type: 'control', message: 'y' }
];

let i = 0;
const interval = setInterval(() => {
    if (i >= attempts.length) {
        clearInterval(interval);
        child.kill();
        return;
    }
    const msg = JSON.stringify(attempts[i]);
    console.log(`Sending: ${msg}`);
    child.stdin.write(msg + '\n');
    i++;
}, 3000); // Send every 3s
