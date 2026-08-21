export function log(level, msg, jobId) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: redact(msg, jobId)
  };
  if (jobId) {
    entry.jobId = jobId;
  }
  process.stdout.write(JSON.stringify(entry) + '\n');
}

function redact(msg, jobId) {
  if (typeof msg !== 'string') return msg;

  let result = msg;
  
  // 1. Redact absolute local paths: C:\Users\..., /home/..., /Users/...
  const pathRegex = /(?:[A-Za-z]:\\[^\s'"]+)|(?:\/(?:home|Users)\/[^\s'"]+)/g;
  result = result.replace(pathRegex, (match) => {
    // try to get extension
    const extMatch = match.match(/(\.[a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    if (jobId && ext) {
      return `${jobId}${ext}`;
    }
    return '[REDACTED_PATH]';
  });

  // 2. Redact real storage hosts, CDN URLs, database URIs
  // Allowed: localhost, 127.0.0.1, example.com, .local
  const urlRegex = /(https?|mongodb|redis):\/\/([^\s'"/]+)/g;
  result = result.replace(urlRegex, (match, proto, host) => {
    if (
      host.includes('localhost') || 
      host.includes('127.0.0.1') || 
      host.includes('example.com') || 
      host.endsWith('.local')
    ) {
      return match;
    }
    return `${proto}://[REDACTED_HOST]`;
  });

  // 3. Redact Mongo ObjectIds (24 hex chars)
  const objectIdRegex = /\b[0-9a-fA-F]{24}\b/g;
  result = result.replace(objectIdRegex, '[REDACTED_ID]');

  return result;
}

export function debug(msg, jobId) { log('debug', msg, jobId); }
export function info(msg, jobId) { log('info', msg, jobId); }
export function warn(msg, jobId) { log('warn', msg, jobId); }
export function error(msg, jobId) { log('error', msg, jobId); }
