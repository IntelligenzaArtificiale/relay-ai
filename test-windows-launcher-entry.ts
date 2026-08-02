import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';
import { runCommand } from './src/services/command-runner.js';
import { spawnManagedProcess } from './src/services/process-launcher.js';
import { terminateProcessTree } from './src/services/command-runner.js';

if (process.platform !== 'win32') {
  console.log('  SKIP native Windows .cmd integration (host is not Windows)');
} else {
  const root = await mkdtemp(join(tmpdir(), 'Relay (cmd) & Unicode '));
  try {
    const helper = join(root, 'helper.js');
    const wrapper = join(root, 'relay test.cmd');
    await writeFile(helper, `
const mode=process.argv[2];
if(mode==='--version'){ console.log('relay-wrapper 1.2.3'); process.exit(0); }
if(mode==='stderr'){ console.error('errore UTF-8 non riconosciuto'); process.exit(7); }
if(mode==='persistent'){
  const rl=require('node:readline').createInterface({input:process.stdin});
  rl.on('line',line=>console.log('rpc:'+line));
}else{
  let input=''; process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>input+=chunk);
  process.stdin.on('end',()=>console.log(JSON.stringify({args:process.argv.slice(2),input})));
}
`, 'utf8');
    await writeFile(wrapper, `@echo off\r\nnode "%~dp0helper.js" %*\r\n`, 'utf8');

    const version = await runCommand(wrapper, ['--version'], { timeoutMs: 10_000 });
    assert.equal(version.exitCode, 0, version.stderr || version.stdout);
    assert.match(version.stdout, /1\.2\.3/);

    const payload = 'stdin con caratteri e simboli & parentesi ()';
    const args = ['alpha', 'a & b', '(parentesi)', 'utente'];
    const executed = await runCommand(wrapper, args, { stdin: payload, timeoutMs: 10_000 });
    assert.equal(executed.exitCode, 0);
    const parsed = JSON.parse(executed.stdout);
    assert.deepEqual(parsed.args, args);
    assert.equal(parsed.input, payload);

    const failed = await runCommand(wrapper, ['stderr'], { timeoutMs: 10_000 });
    assert.equal(failed.exitCode, 7);
    assert.match(failed.stderr, /non riconosciuto/);

    const child = spawnManagedProcess(wrapper, ['persistent'], { windowsHide: true });
    child.stdout.setEncoding('utf8');
    const lines = readline.createInterface({ input: child.stdout });
    const response = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('persistent wrapper timeout')), 8_000);
      lines.once('line', (line) => { clearTimeout(timer); resolve(line); });
    });
    child.stdin.write('{"method":"initialize"}\n');
    assert.equal(await response, 'rpc:{"method":"initialize"}');
    terminateProcessTree(child);
    console.log('  PASS native Windows .cmd version, args, stdin, stderr, exit code and persistent process');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
