#!/usr/bin/env node
const net = require("net");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
    let buffer = "";
    console.log(`Connection from ${socket.remoteAddress}:${socket.remotePort}`);
    socket.on("close", () => {
	socket.end();
    });
    socket.on("data", (data) => {
	let newdata = data.toString();
	// You should buffer input.
	// https://www.reddit.com/r/node/comments/59zgte/comment/d9cnymh/
	buffer += newdata;
	let lines = buffer.split("\r\n");
	buffer = lines[lines.length - 1];
	lines = lines.slice(0, -1);
	lines.forEach((line) => {
	    let matches;
	    // GET request
	    if (matches = /^GET\s+(\S+)/.exec(line)) {
		let path = matches[1];
		if (path === "/") {
		    socket.write("HTTP/1.1 200 OK\r\n\r\n");
		} else {
		    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
		}
		socket.end();
	    }
	});
    });
});

server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
