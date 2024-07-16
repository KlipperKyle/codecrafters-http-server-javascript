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
    let sockInput = "";		// Buffer for raw input
    let reqType = "";		// GET or POST
    let response = "";		// Textual response to send to client
    let headers = {};		// Hash of HTTP headers
    let userAgentEcho = false;	// Triggers an echo of the client's
				// User-Agent, for `GET /user-agent`
    let isReadingBody = false;	// Whether we are reading the body of
				// a POST, as opposed to HTTP headers
    let writeFile = false;	// Triggers a file write, for `POST
				// /files/{foo}`
    let writeFilePath;		// Path of file to be written
    let body = "";		// Body of the HTTP request, for POSTs
    function onData(data) {
	// Incoming data event handler
	// You should buffer input.
	// https://www.reddit.com/r/node/comments/59zgte/comment/d9cnymh/
	sockInput += data.toString();
	let lines = sockInput.split("\r\n");
	sockInput = lines.pop();
	// sockInput contains the last line fragment, i.e. characters
	// that were not terminated with a \r\n.
	lines.forEach(readLine);
	if (isReadingBody) {
	    body += sockInput;
	    if (body.length >= (headers["content-length"] ?? 0)) {
		writeFiles();
		close();
	    }
	}
    }
    function readLine(line) {
	// Read a line from the incoming buffer
	let matches;
	if (isReadingBody) {
	    body += line + "\r\n";
	} else if (matches = /^GET\s+(\S+)/.exec(line)) {
	    // GET request
	    let gpath = matches[1];
	    reqType = "GET";
	    if (response.length > 0) {
		// 400 Bad Request
		// You can't have multiple GET/POST lines.
		badRequest();
		close();
	    } else if (gpath === "/") {
		getSlash();
	    } else if (matches = /^\/echo\/(.*)/.exec(gpath)) {
		getEcho(matches[1]);
	    } else if (matches = /^\/files\/(.*)/.exec(gpath)) {
		getFiles(matches[1]);
	    } else if (matches = /^\/user-agent\/?$/.exec(gpath)) {
		getUserAgent();
	    } else {
		getFallback(gpath);
	    }
	} else if (matches = /^POST\s+(\S+)/.exec(line)) {
	    // POST request
	    let ppath = matches[1];
	    reqType = "POST";
	    if (response.length > 0) {
		// 400 Bad Request
		// You can't have multiple GET/POST lines.
		badRequest();
		close();
	    } else if (matches = /^\/files\/(.+)/.exec(ppath)) {
		postFiles(matches[1]);
	    } else {
		postFallback(ppath);
	    }
	} else if (matches = /^(\S+):\s*(.*)/.exec(line)) {
	    // Header: Value
	    let header = matches[1].toLowerCase();
	    let value = matches[2];
	    headers[header] = value;
	} else if (matches = /^$/.exec(line)) {
	    // That's all the headers, folks!
	    echoUserAgent();
	    if (reqType === "POST") {
		isReadingBody = true;
	    } else {
		close();
	    }
	}
    }
    function getSlash() {
	// GET /
	console.log(`200 OK: GET / from ` +
		    `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 200 OK\r\n\r\n";
    }
    function getEcho(str) {
	// GET /echo/{str}
	console.log(`200 OK: GET /echo/${str} from ` +
		    `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 200 OK\r\n";
	response += "Content-Type: text/plain\r\n";
	response += `Content-Length: ${str.length}\r\n\r\n`;
	response += str;
    }
    function getFiles(relpath) {
	// GET /files/{filepath}
	let fpath = path.resolve(relpath);
	if (directory === undefined) {
	    console.error(`ERROR: 403 Forbidden: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
	    return;
	}
	if (! fs.existsSync(fpath)) {
	    console.error(`ERROR: 404 Not Found: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 404 Not Found\r\n\r\n";
	    return;
	}
	try {
	    if (! new RegExp(`^${directory}/`).test(fpath)) {
		throw new Error("Path is outside cwd");
	    }
	    contents = fs.readFileSync(fpath);
	    console.log(`200 OK: GET /files/${relpath} from ` +
			`${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 200 OK\r\n";
	    response += "Content-Type: application/octet-stream\r\n";
	    response += `Content-Length: ${contents.length}\r\n\r\n`;
	    response += contents;
	} catch (err) {
	    console.error(`ERROR: 403 Forbidden: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
	}
    }
    function getUserAgent() {
	// GET /user-agent
	console.log(`200 OK: GET /user-agent from ` +
		    `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 200 OK\r\n";
	// Echo the User-Agent later
	userAgentEcho = true;
    }
    function echoUserAgent() {
	if (userAgentEcho) {
	    let ua = headers["user-agent"] ?? "";
	    response += "Content-Type: text/plain\r\n";
	    response += `Content-Length: ${ua.length}\r\n\r\n`;
	    response += ua;
	}
    }
    function getFallback(gpath) {
	// GET {anything else}
	console.error(`ERROR: 404 Not Found: GET ${gpath} from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 404 Not Found\r\n\r\n";
    }
    function badRequest() {
	// 400 Bad Request
	console.error(`ERROR: 400 Bad Request: from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 400 Bad Request\r\n\r\n";
    }
    function postFiles(relpath) {
	// POST /files/{relpath}
	// Queue up a file write for later (writeFiles())
	writeFile = true;
	writeFilePath = relpath;
    }
    function writeFiles() {
	if (!writeFile) {return;}
	let fpath = path.resolve(writeFilePath);
	if (directory === undefined) {
	    console.error(`ERROR: 403 Forbidden: POST /files/${writeFilePath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
	    return;
	}
	try {
	    if (! new RegExp(`^${directory}/`).test(fpath)) {
		throw new Error("Path is outside cwd");
	    }
	    fs.writeFileSync(fpath, body);
	    console.log(`201 Created: POST /files/${writeFilePath} from ` +
			`${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 201 Created\r\n\r\n";
	} catch (err) {
	    console.error(`ERROR: 403 Forbidden: POST /files/${writeFilePath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    response = "HTTP/1.1 403 Forbidden\r\n\r\n";
	}
    }
    function postFallback(ppath) {
	// POST {anything else}
	// 405 Method Not Allowed
	console.error(`ERROR: 405 Method Not Allowed: POST ${ppath} from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	response = "HTTP/1.1 405 Method Not Allowed\r\n\r\n";
    }
    function close() {
	socket.write(response);
	socket.end();
    }
    socket.on("data", onData);
    socket.on("close", close);
}

parseArgs(process.argv);
const server = net.createServer(dispatchClient);
server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
