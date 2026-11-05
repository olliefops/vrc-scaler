import {Server} from "node-osc";
import { parseArgs } from "util";

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
    strict: false, // Prevents errors if other unknown flags are passed
});

export class OSCController {
    private server: Server | undefined;

    constructor() {
        this.server = new Server(params["osc-server-port"], params["osc-server-host"], () => {
            console.log(`OSC Server started at ${params["osc-server-host"]}:${params["osc-server-port"]}`);
        })
    }

    addEventListener(address: string, eventHandler: (data: string|number|boolean) => void) {
        if (!this.server) return;

        console.debug(`Added event listener at address "${address}"`);
        this.server.on('message', (msg: [string, string|number|boolean]) => {
            const [msgAddress, msgValue] = msg;

            if (msgAddress == address) {
                console.debug(`Event triggered at address "${address}": ${msgValue}`);
                eventHandler(msgValue);
            }
        })
    }
}