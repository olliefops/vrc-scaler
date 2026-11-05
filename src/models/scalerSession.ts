import {Client} from "node-osc";

const filePath = 'VRCSCaler-Sessions-Data.json';
let oscVRC = new Client(process.env.OSC_SERVER_HOST ?? '127.0.0.1', process.env.OSC_SERVER_PORT ?? 9000);

export class ScalerSession {
    // Avatar Data
    avatarId: string;
    currentEyeHeight?: number;

    // Scaling Data
    state: number = 0;
    scaleRate: number = 0.25;
    scaleRateUnit: 0|1 = 0; // 0: meters, 1: centimeters

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
        if (!this) return;
        stopScale();

        if (this.state === 0) return;
        this.scalerTimer = setInterval(() => {
            if (!this.currentEyeHeight || !this.scaleRate) return;
            if (this.currentEyeHeight >= 10 || this.currentEyeHeight <= 0.5) {
                stopScale();
                return;
            }

            // Current Eye Height + State (-1/1) * ( ScaleRate (meters/centimeters) / 100 (iterations per second) )
            this.setEyeHeight(this.currentEyeHeight + this.state * ( ( this.scaleRateUnit == 0 ? this.scaleRate : this.scaleRate / 100 ) / 100 ));
        }, 1000 / 100);
    }

    stopScale() {
        clearInterval(this.scalerTimer);
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