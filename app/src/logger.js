// Log dạng JSON, mỗi dòng một sự kiện, ghi ra stdout/stderr.
// Docker thu stdout của container -> Promtail/Loki đọc và parse bằng "| json" trong LogQL.

function write(level, msg, fields = {}) {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    service: 'pos-app',
    msg,
    ...fields,
  });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields),
};
