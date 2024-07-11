#!/usr/bin/env node

const net = require("net");

function dispatchClient(socket) {
    let buffer = "";
    let response = "";
    let headers = {};
    let userAgentEcho = false;
    function getData(data) {
	let newdata = data.toString();
	// You should buffer input.
	// https://www.reddit.com/r/node/comments/59zgte/comment/d9cnymh/
	buffer += newdata;
	let lines = buffer.split("\r\n");
	buffer = lines[lines.length - 1];
	lines = lines.slice(0, -1);
	lines.forEach(function(line) {
	    let matches;
	    if (matches = /^GET\s+(\S+)/.exec(line)) {
		// GET request
		let path = matches[1];
		if (path === "/") {
		    // GET /
		    console.log(`200 OK: GET ${path} from ` +
				`${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 200 OK\r\n\r\n";
		} else if (matches = /^\/echo\/(.*)/.exec(path)) {
		    // GET /echo/{str}
		    console.log(`200 OK: GET ${path} from ` +
				`${socket.remoteAddress}:${socket.remotePort}`);
		    let str = matches[1];
		    response = "HTTP/1.1 200 OK\r\n";
		    response += "Content-Type: text/plain\r\n";
		    response += `Content-Length: ${str.length}\r\n\r\n`;
		    response += str;
		} else if (matches = /^\/user-agent\/?$/.exec(path)) {
		    // GET /user-agent
		    // Echo the User-Agent later
		    userAgentEcho = true;
		} else {
		    // GET {anything else}
		    console.error(`ERROR: 404 Not Found: GET ${path} from ` +
				  `${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 404 Not Found\r\n\r\n";
		}
	    } else if (matches = /^(\S+):\s*(.*)/.exec(line)) {
		// Header: Value
		let header = matches[1].toLowerCase();
		let value = matches[2];
		headers[header] = value;
	    } else if (matches = /^$/.exec(line)) {
		// That's the whole request, folks!
		if (userAgentEcho) {
		    let ua = headers["user-agent"] ?? "";
		    response = "HTTP/1.1 200 OK\r\n";
		    response += "Content-Type: text/plain\r\n";
		    response += `Content-Length: ${ua.length}\r\n\r\n`;
		    response += ua;
		}
		close();
	    }
	});
    }
    function close() {
	socket.write(response);
	socket.end();
    }
    socket.on("data", getData);
    socket.on("close", close);
}

const server = net.createServer(dispatchClient);
server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
