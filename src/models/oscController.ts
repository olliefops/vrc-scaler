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
    private server: Server | undefined;

    constructor(onReady: Function) {
        this.server = new Server(params["osc-server-port"], params["osc-server-host"])

        if (this.server) {
            this.server.on('listening', () => {
                log.success(`OSC Server: Listening on ${params["osc-server-host"]}:${params["osc-server-port"]}`);
                onReady();
            });
            this.server.on('error', (err) => {
                if (!this.server) return;
                log.error('OSC Server: ', err);
                this.server.close();
            });

            this.server.setMaxListeners(20);
        }
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