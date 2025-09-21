var http = require('http');

http.createServer(function (req, res) {
  res.write("deez nuts");
  res.end();
}).listen(8080);