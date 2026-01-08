
const { spawn } = require('child_process');

const claudePath = 'claude';

const args = [
    '-p', '', 
    '--output-format', 'stream-json',
    '--input-format', 'stream-json',
    '--verbose'
];

console.log('Spawning claude (JSON response test) with:', args.join(' '));

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

const prompt = "Please create a file named 'repro_json.txt' with content 'json_test'.";
const userMessage = JSON.stringify({
    type: 'user',
    message: {
        role: 'user',
        content: prompt,
    },
}) + '\n';

console.log('Writing prompt to stdin...');
child.stdin.write(userMessage);

// Wait for permission prompt
setTimeout(() => {
    console.log('Sending "y" (JSON string)...');
    child.stdin.write('"y"\n');
}, 5000);

// Wait and try 'true'
setTimeout(() => {
    console.log('Sending true (JSON boolean)...');
    child.stdin.write('true\n');
}, 7000);

// Wait and try object
setTimeout(() => {
    console.log('Sending object response...');
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'y' } }) + '\n');
}, 9000);


// Kill after 15s
setTimeout(() => {
    console.log('Timeout. Killing.');
    child.kill();
}, 15000);
