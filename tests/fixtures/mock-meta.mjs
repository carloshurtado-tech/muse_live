// Mock of Meta Model API /v1/chat/completions for end-to-end tests: step 1 asks for tools,
// step 2 answers from the tool results. No key, no network, deterministic.
// Port: MOCK_META_PORT (default 8799). A debug port (+1 below) returns the last request body.
import http from 'node:http';
let last = null;
http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  const j = JSON.parse(b || '{}'); last = j;
  const msgs = j.messages || [], lastMsg = msgs[msgs.length - 1];
  const user = [...msgs].reverse().find((m) => m.role === 'user')?.content || '';
  let message;
  if (lastMsg.role !== 'tool') {
    const calls = [];
    if (/weather/i.test(user)) calls.push({ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: JSON.stringify({ production: 'museaitour' }) } });
    if (/camera/i.test(user)) calls.push({ id: 'c2', type: 'function', function: { name: 'get_equipment', arguments: JSON.stringify({ production: 'Muse AI World Tour', search: 'camera' }) } });
    if (/audio|missing/i.test(user)) calls.push({ id: 'c3', type: 'function', function: { name: 'get_department', arguments: JSON.stringify({ production: 'orion', department: 'audio' }) } });
    if (/mark|set/i.test(user)) calls.push({ id: 'c4', type: 'function', function: { name: 'propose_change', arguments: JSON.stringify({ action: 'set_department_status', production: 'museaitour', department: 'Legal', status: 'approved' }) } });
    message = calls.length ? { role: 'assistant', content: null, tool_calls: calls } : { role: 'assistant', content: 'Hello from the mock. **No tools needed.**' };
  } else {
    const tools = msgs.filter((m) => m.role === 'tool').map((m) => m.content.slice(0, 160));
    message = { role: 'assistant', content: '**Mock answer** from ' + tools.length + ' tool results:\n\n' + tools.map((t) => '- `' + t.replace(/`/g, '') + '`').join('\n') + '\n\n| Check | Result |\n|---|---|\n| Tools | ' + tools.length + ' |' };
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ model: j.model, choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: JSON.stringify(j).length / 4 | 0 } }));
}).listen(+(process.env.MOCK_META_PORT || 8799), '127.0.0.1', () => console.log('mock Meta Model API on', +(process.env.MOCK_META_PORT || 8799)));
http.createServer((q, r) => { r.end(JSON.stringify(last)); }).listen(+(process.env.MOCK_META_PORT || 8799) - 1, '127.0.0.1');
