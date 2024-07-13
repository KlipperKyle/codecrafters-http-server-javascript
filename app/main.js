#!/usr/bin/env node

const fs = require("node:fs");
const net = require("net");
const path = require("node:path");

const HELP =`
main.js: CodeCrafters HTTP Server in JavaScript

Options:

(--directory | -d) DIR
	Serve files from DIR
--help | -h
	Show this help
`;

let directory;

function parseArgs(argv) {
    // Process CLI options
    argv.shift();
    argv.shift();
    while (argv.length > 0) {
	let a = argv.shift();
	if (a === "--directory" || a === "-d") {
	    if (argv.length == 0) {
		console.error("ERROR: Must specify directory with --directory or -d");
		process.exit(1);
	    }
	    directory = path.resolve(argv.shift());
	    process.chdir(directory);
	} else if (a === "--help" || a === "-h" || a === "-?") {
	    console.log(HELP)
	    process.exit();
	} else {
	    console.error(`ERROR: Unkown parameter ${a}`);
	    console.error(HELP);
	    process.exit(1);
	}
    }
}

function dispatchClient(socket) {
    // Handle a single client connection
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
	lines.forEach(readLine);
    }
    function readLine(line) {
	let matches;
	if (matches = /^GET\s+(\S+)/.exec(line)) {
	    // GET request
	    let gpath = matches[1];
	    if (response.length > 0) {
		// 400 Bad Request
		// You can't have multiple GET lines.
		console.error(`ERROR: 400 Bad Request: from ` +
			      `${socket.remoteAddress}:${socket.remotePort}`);
		response = "HTTP/1.1 400 Bad Request\r\n\r\n";
		close();
		return;
	    }
	    if (gpath === "/") {
		// GET /
		console.log(`200 OK: GET ${gpath} from ` +
			    `${socket.remoteAddress}:${socket.remotePort}`);
		response = "HTTP/1.1 200 OK\r\n\r\n";
	    } else if (matches = /^\/echo\/(.*)/.exec(gpath)) {
		// GET /echo/{str}
		console.log(`200 OK: GET ${gpath} from ` +
			    `${socket.remoteAddress}:${socket.remotePort}`);
		let str = matches[1];
		response = "HTTP/1.1 200 OK\r\n";
		response += "Content-Type: text/plain\r\n";
		response += `Content-Length: ${str.length}\r\n\r\n`;
		response += str;
	    } else if (matches = /^\/files\/(.*)/.exec(gpath)) {
		// GET /files/{filepath}
		let fpath = path.resolve(matches[1]);
		if (directory === undefined) {
		    console.error(`ERROR: 403 Forbidden: GET ${gpath} from ` +
				  `${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
		    return;
		}
		if (! fs.existsSync(fpath)) {
		    console.error(`ERROR: 404 Not Found: GET ${gpath} from ` +
				  `${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 404 Not Found\r\n\r\n";
		    return;
		}
		try {
		    if (! new RegExp(`^${directory}/`).test(fpath)) {
			throw new Error("Path is outside cwd");
		    }
		    contents = fs.readFileSync(fpath);
		    console.log(`200 OK: GET ${gpath} from ` +
				`${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 200 OK\r\n";
		    response += "Content-Type: application/octet-stream\r\n";
		    response += `Content-Length: ${contents.length}\r\n\r\n`;
		    response += contents;
		} catch (err) {
		    console.error(`ERROR: 403 Forbidden: GET ${gpath} from ` +
				`${socket.remoteAddress}:${socket.remotePort}`);
		    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
		}
	    } else if (matches = /^\/user-agent\/?$/.exec(gpath)) {
		// GET /user-agent
		// Echo the User-Agent later
		console.log(`200 OK: GET ${gpath} from ` +
			    `${socket.remoteAddress}:${socket.remotePort}`);
		response = "HTTP/1.1 200 OK\r\n";
		userAgentEcho = true;
	    } else {
		// GET {anything else}
		console.error(`ERROR: 404 Not Found: GET ${gpath} from ` +
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
		response += "Content-Type: text/plain\r\n";
		response += `Content-Length: ${ua.length}\r\n\r\n`;
		response += ua;
	    }
	    close();
	}
    }
    function close() {
	socket.write(response);
	socket.end();
    }
    socket.on("data", getData);
    socket.on("close", close);
}

parseArgs(process.argv);
const server = net.createServer(dispatchClient);
server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
