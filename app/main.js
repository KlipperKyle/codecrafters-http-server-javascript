#!/usr/bin/env node

const net = require("net");

function dispatchClient(socket) {
    let buffer = "";
    console.log(`Connection from ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on("close", function() {
	socket.end();
    });
    socket.on("data", function(data) {
	let newdata = data.toString();
	// You should buffer input.
	// https://www.reddit.com/r/node/comments/59zgte/comment/d9cnymh/
	buffer += newdata;
	let lines = buffer.split("\r\n");
	buffer = lines[lines.length - 1];
	lines = lines.slice(0, -1);
	lines.forEach(function(line) {
	    let matches;
	    // GET request
	    if (matches = /^GET\s+(\S+)/.exec(line)) {
		let path = matches[1];
		if (path === "/") {
		    socket.write("HTTP/1.1 200 OK\r\n\r\n");
		} else if (matches = /^\/echo\/(.*)/.exec(path)) {
		    let str = matches[1];
		    let response = "HTTP/1.1 200 OK\r\n";
		    response += "Content-Type: text/plain\r\n";
		    response += `Content-Length: ${str.length}\r\n\r\n`;
		    response += str;
		    socket.write(response);
		} else {
		    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		}
		socket.end();
	    }
	});
    });
}

const server = net.createServer(dispatchClient);
server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
