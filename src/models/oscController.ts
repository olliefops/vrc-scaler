import {Server} from "node-osc";
import { parseArgs } from "util";
import {log, stream} from "@clack/prompts";

const { values: params } = parseArgs({
    options: {
        "osc-server-host": {
            type: "string",
            default: "127.0.0.1"
        },
        "osc-server-port": {
            type: "string",
            default: "9001"
        },
    },
    strict: false,
});

export class OSCController {
    server: Server | undefined;

    constructor(onReady: Function) {
        if (typeof params["osc-server-port"] !== "string" || typeof params["osc-server-host"] !== "string") return;
        const OSCServer = new Server(parseInt(params["osc-server-port"]), params["osc-server-host"])

        OSCServer.on('listening', () => onReady());
        OSCServer.on('error', () => this.server?.close());
        OSCServer.setMaxListeners(20);

        this.server = OSCServer;
    }

    addEventListener(address: string, eventHandler: (data: string|number|boolean) => void) {
        if (!this.server) return;

        this.server.on('message', (msg: [string, string|number|boolean]) => {
            const [msgAddress, msgValue] = msg;

            if (msgAddress == address) {
                eventHandler(msgValue);
            }
        })
    }
}