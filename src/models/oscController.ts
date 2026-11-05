import {Server} from "node-osc";

export class OSCController {
    private server: Server | undefined;

    constructor() {
        const serverAddress = process.env.OSC_SERVER_HOST ?? '127.0.0.1';
        const serverPort = process.env.OSC_SERVER_PORT ?? 9001;

        this.server = new Server(serverPort, serverAddress, () => {
            console.log(`OSC Server started at ${serverAddress}:${serverPort}`);
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