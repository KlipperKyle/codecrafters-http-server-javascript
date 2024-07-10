#!/usr/bin/env node
const net = require("net");

// Uncomment this to pass the first stage
const server = net.createServer((socket) => {
    socket.on("close", () => {
	socket.end();
    });
    socket.write("HTTP/1.1 200 OK\r\n\r\n");
    socket.end();
});

server.listen(4221, "localhost");
