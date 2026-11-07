import {Server} from "node-osc";

export class OscServer {
    server: Server | undefined;

    constructor(host: string, port: number, onReady: Function) {
        const OSCServer = new Server(port, host);

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