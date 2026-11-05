import {Client} from "node-osc";
import {parseArgs} from "util";

const { values: params } = parseArgs({
    options: {
        "osc-vrc-host": {
            type: "string",
            default: "127.0.0.1"
        },
        "osc-vrc-port": {
            type: "string",
            default: "9000"
        },
    },
    strict: false, // Prevents errors if other unknown flags are passed
});
const filePath = 'VRCSCaler-Sessions-Data.json';
const oscVRC = new Client(params["osc-vrc-host"], params["osc-vrc-port"]);

export class ScalerSession {
    // Avatar Data
    avatarId: string;
    currentEyeHeight?: number;

    // Scaling Data
    state: number = 0;
    scaleRate: number = 0.25;
    scaleRateUnit: number = 0; // 0: meters, 1: centimeters

    // Session Settings
    autoRestoreData?: boolean;

    static metersUnit: 0;
    static centimetersUnit: 1;

    private scalerTimer: NodeJS.Timer | null = null;

    constructor(avatarId: string) {
        this.avatarId = avatarId;
    }

    setScalerState(value: number) {
        if (this.currentEyeHeight || typeof value !== "number") return;
        this.state = value;
        oscVRC.send('/avatar/parameters/Scaler/State', {
            type: 'float',
            value: value
        });
    }

    setEyeHeight(value: number) {
        this.currentEyeHeight = value;
        oscVRC.send('/avatar/eyeheight', value);
    }

    startScale() {
        this.stopScale();
        if (this.state === 0) return;

        this.scalerTimer = setInterval(() => {
            if (!this.currentEyeHeight || !this.scaleRate) return;
            if (this.currentEyeHeight >= 10 || this.currentEyeHeight <= 0.5) {
                this.stopScale();
                return;
            }

            // Current Eye Height + State (-1/1) * ( ScaleRate (meters/centimeters) / 100 (iterations per second) )
            this.setEyeHeight(this.currentEyeHeight + this.state * ( ( this.scaleRateUnit == 0 ? this.scaleRate : this.scaleRate / 100 ) / 100 ));
        }, 1000 / 100);
    }

    stopScale() {
        clearInterval(this.scalerTimer);
    }

    applyParameters() {
        const meterScale = this.scaleRateUnit == 0 ? this.scaleRate : this.scaleRate / 100;
        const centimeterScale = this.scaleRateUnit == 0 ? this.scaleRate * 100 : this.scaleRate;

        oscVRC.send('/avatar/parameters/Scaler/State', {
            type: 'int',
            value: this.state
        });
        oscVRC.send('/avatar/parameters/Scaler/Rate', {
            type: 'float',
            value: this.scaleRate
        });
        oscVRC.send('/avatar/parameters/Scaler/Rate/Unit', {
            type: 'float',
            value: this.scaleRateUnit
        });
        oscVRC.send('/avatar/parameters/Scaler/Rate/Meters', {
            type: 'float',
            value: meterScale
        });
        oscVRC.send('/avatar/parameters/Scaler/Rate/Centimeters', {
            type: 'float',
            value: centimeterScale
        });
    }

    async save() {
        const file = await Bun.file(filePath, { type: "application/json" });
        let sessions = [];

        if (await file.exists()) {
            const json = await file.json();
            sessions = json.filter((item: ScalerSession) => item.avatarId !== this.avatarId);
        }

        if (Bun.write(filePath, JSON.stringify([...sessions, this], null, 2))) {
            console.debug(`Saved session: ${JSON.stringify(this)}`);
        } else {
            console.error(`Failed saving session: ${JSON.stringify(this)}`);
        }

        return;
    }

    static async fetchSession(avatarId: string) {
        const file = await Bun.file(filePath, { type: "application/json" });
        const session = new ScalerSession(avatarId);

        if (await file.exists()) {
            const json = await file.json();
            const sessionData = json.find((item: ScalerSession) => item.avatarId === avatarId);

            if (sessionData) {
                session.currentEyeHeight = sessionData.currentEyeHeight;
                session.state = sessionData.state;
                session.scaleRate = sessionData.metersPerSecondRate;
                session.scaleRateUnit = sessionData.rateUnit;
                session.autoRestoreData = sessionData.autoRestoreData;
            }

            return session;
        }

        return session;
    }
}