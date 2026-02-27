const http = require('http');

http.createServer((req, res) => {
  res.write("Bot running");
  res.end();
}).listen(8080);
