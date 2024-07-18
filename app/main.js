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

const supportedCompressions = new Set (["gzip"]);

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
    let reqHead = "";		// Command and headers
    let reqType = "";		// GET or POST
    let reqHeaders = {};	// Request headers
    let reqBody = "";		// Request body, for POSTs
    let resLine = "";		// Response line
    let resHeaders = {};	// Response headers
    let resBody = "";		// Response body
    let userAgentEcho = false;	// Triggers an echo of the client's
				// User-Agent, for `GET /user-agent`
    let isReadingBody = false;	// Whether we are reading the body of
				// a POST, as opposed to HTTP headers
    let writeFile = false;	// Triggers a file write, for `POST
				// /files/{foo}`
    let writeFilePath;		// Path of file to be written
    function onData(data) {
	// Incoming data event handler
	if (!isReadingBody) {
	    reqHead += data.toString();
	    let m;
	    if (m = reqHead.match(/(.+?\r\n)\r\n(.*)/sm)) {
		reqHead = m[1];
		reqBody = m[2];
		reqHead.split("\r\n").forEach(readLine);
	    }
	} else {
	    reqBody += data.toString();
	}
	if (isReadingBody && reqBody.length >= (reqHeaders["content-length"] ?? 0)) {
	    writeFiles();
	    close();
	}
    }
    function readLine(line) {
	// Read a line from the incoming buffer
	let m;
	if (m = /^GET\s+(\S+)/.exec(line)) {
	    // GET request
	    let gpath = m[1];
	    reqType = "GET";
	    if (resLine.length > 0) {
		// 400 Bad Request
		// You can't have multiple GET/POST lines.
		badRequest();
		close();
	    } else if (gpath === "/") {
		getSlash();
	    } else if (m = /^\/echo\/(.*)/.exec(gpath)) {
		getEcho(m[1]);
	    } else if (m = /^\/files\/(.*)/.exec(gpath)) {
		getFiles(m[1]);
	    } else if (m = /^\/user-agent\/?$/.exec(gpath)) {
		getUserAgent();
	    } else {
		getFallback(gpath);
	    }
	} else if (m = /^POST\s+(\S+)/.exec(line)) {
	    // POST request
	    let ppath = m[1];
	    reqType = "POST";
	    if (resLine.length > 0) {
		// 400 Bad Request
		// You can't have multiple GET/POST lines.
		badRequest();
		close();
	    } else if (m = /^\/files\/(.+)/.exec(ppath)) {
		postFiles(m[1]);
	    } else {
		postFallback(ppath);
	    }
	} else if (m = /^(\S+):\s*(.*)/.exec(line)) {
	    // Header: Value
	    let header = m[1].toLowerCase();
	    let value = m[2];
	    reqHeaders[header] = value;
	} else if (m = /^$/.exec(line)) {
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
	resLine = "HTTP/1.1 200 OK";
    }
    function getEcho(str) {
	// GET /echo/{str}
	console.log(`200 OK: GET /echo/${str} from ` +
		    `${socket.remoteAddress}:${socket.remotePort}`);
	resLine = "HTTP/1.1 200 OK";
	resHeaders["Content-Type"] = "text/plain";
	resBody = str;
    }
    function getFiles(relpath) {
	// GET /files/{filepath}
	let fpath = path.resolve(relpath);
	if (directory === undefined) {
	    console.error(`ERROR: 403 Forbidden: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 403 Forbidden";
	    return;
	}
	if (! fs.existsSync(fpath)) {
	    console.error(`ERROR: 404 Not Found: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 404 Not Found";
	    return;
	}
	try {
	    if (! new RegExp(`^${directory}/`).test(fpath)) {
		throw new Error("Path is outside cwd");
	    }
	    contents = fs.readFileSync(fpath);
	    console.log(`200 OK: GET /files/${relpath} from ` +
			`${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 200 OK";
	    resHeaders["Content-Type"] = "application/octet-stream";
	    resBody = contents;
	} catch (err) {
	    console.error(`ERROR: 403 Forbidden: GET /files/${relpath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 403 Forbidden";
	}
    }
    function getUserAgent() {
	// GET /user-agent
	console.log(`200 OK: GET /user-agent from ` +
		    `${socket.remoteAddress}:${socket.remotePort}`);
	resLine = "HTTP/1.1 200 OK";
	// Echo the User-Agent later
	userAgentEcho = true;
    }
    function echoUserAgent() {
	if (userAgentEcho) {
	    let ua = reqHeaders["user-agent"] ?? "";
	    resHeaders["Content-Type"] = "text/plain";
	    resBody = ua;
	}
    }
    function getFallback(gpath) {
	// GET {anything else}
	console.error(`ERROR: 404 Not Found: GET ${gpath} from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	resLine = "HTTP/1.1 404 Not Found";
    }
    function badRequest() {
	// 400 Bad Request
	console.error(`ERROR: 400 Bad Request: from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	resLine = "HTTP/1.1 400 Bad Request";
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
	    resLine = "HTTP/1.1 403 Forbidden";
	    return;
	}
	try {
	    if (! new RegExp(`^${directory}/`).test(fpath)) {
		throw new Error("Path is outside cwd");
	    }
	    fs.writeFileSync(fpath, reqBody);
	    console.log(`201 Created: POST /files/${writeFilePath} from ` +
			`${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 201 Created";
	} catch (err) {
	    console.error(`ERROR: 403 Forbidden: POST /files/${writeFilePath} from ` +
			  `${socket.remoteAddress}:${socket.remotePort}`);
	    resLine = "HTTP/1.1 403 Forbidden";
	}
    }
    function postFallback(ppath) {
	// POST {anything else}
	// 405 Method Not Allowed
	console.error(`ERROR: 405 Method Not Allowed: POST ${ppath} from ` +
		      `${socket.remoteAddress}:${socket.remotePort}`);
	resLine = "HTTP/1.1 405 Method Not Allowed";
    }
    function finalizeResponse() {
	resHeaders["Content-Length"] = resBody.length;
	if (supportedCompressions.has(reqHeaders["accept-encoding"])) {
	    resHeaders["Content-Encoding"] = reqHeaders["accept-encoding"];
	}
    }
    function serializeResponse() {
	let response = resLine + "\r\n";
	for (let h in resHeaders) {
	    response += `${h}: ${resHeaders[h]}\r\n`;
	}
	response += "\r\n";
	response += resBody;
	return response;
    }
    function close() {
	finalizeResponse();
	socket.write(serializeResponse());
	socket.end();
    }
    socket.on("data", onData);
    socket.on("close", close);
}

parseArgs(process.argv);
const server = net.createServer(dispatchClient);
server.listen(4221, "localhost");
console.log("Listening on localhost:4221 ...");
