import {oscVRC} from "@/index";
import {log} from "@clack/prompts";

const filePath = 'VRCScaler_Sessions.json';
const minEyeHeight = 0.5;
const maxEyeHeight = 100;
let currentData: ScalerSession[];
let scalerTimer: NodeJS.Timer | null = null;

export class ScalerSession {
    // Avatar Data
    avatarId: string;
    currentEyeHeight?: number;
    defaultEyeHeight?: number;

    // Scaling Data
    state: number = 0;
    scaleRate: number = 1;
    scaleRateUnit: number = 0; // 0: meters, 1: centimeters

    // Session Settings
    autoRestoreData?: boolean;

    static metersUnit = 0;
    static centimetersUnit = 1;

    constructor(avatarId: string) {
        this.avatarId = avatarId;
    }

    setScaleState(value: number) {
        this.state = value;
        oscVRC.send('/avatar/parameters/VRCScaler/State', {
            type: 'float',
            value: value
        });
    }
    setScaleRate(value: number) {
        this.scaleRate = value;
        oscVRC.send('/avatar/parameters/VRCScaler/Rate', {
            type: 'float',
            value: value / 100
        });
    }
    setScaleRateUnit(value: number) {
        this.scaleRateUnit = value;
        oscVRC.send('/avatar/parameters/VRCScaler/Rate/Unit', {
            type: 'float',
            value: value
        });
    }
    updateScaleRate() {
        if (this.scaleRateUnit === ScalerSession.metersUnit) {
            this.setScaleRate(this.scaleRate / 100);
            return;
        }
        if (this.scaleRateUnit === ScalerSession.centimetersUnit) {
            this.setScaleRate(this.scaleRate * 100);
            return;
        }
    }
    setEyeHeight(value: number) {
        this.currentEyeHeight = value;
        oscVRC.send('/avatar/eyeheight',  {
            type: 'float',
            value: value
        });
    }
    resetHeight() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setScaleState(0);
        this.setEyeHeight(this.defaultEyeHeight);
    }
    resetSettings() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setEyeHeight(this.defaultEyeHeight);
        this.setScaleRateUnit(ScalerSession.metersUnit)
        this.setScaleState(0);
        this.setScaleRate(1);
    }
    startScale() {
        if (this.state === 0 || !this.currentEyeHeight || !this.scaleRate) return;
        clearInterval(scalerTimer);

        scalerTimer = setInterval(() => {
            if (!this.currentEyeHeight || !this.scaleRate) return;

            if (this.state === 0) {
                clearInterval(scalerTimer);
                this.setScaleState(0);
                return;
            }

            if (this.state === -1 && this.currentEyeHeight <= minEyeHeight) {
                clearInterval(scalerTimer);
                this.setEyeHeight(minEyeHeight);
                this.setScaleState(0);
                return;
            }

            if (this.state === 1 && this.currentEyeHeight >= maxEyeHeight) {
                clearInterval(scalerTimer);
                this.setEyeHeight(maxEyeHeight);
                this.setScaleState(0);
                return;
            }

            let nextEyeHeight = this.currentEyeHeight + this.state * ( ( this.scaleRateUnit == 0 ? this.scaleRate : this.scaleRate / 100 ) / 50 );
            nextEyeHeight = Math.min(Math.max(nextEyeHeight, minEyeHeight), maxEyeHeight)

            // Current Eye Height + State (-1/1) * ( ScaleRate (meters/centimeters) / 50 (iterations per second) )
            this.setEyeHeight(nextEyeHeight);
        }, 1000 / 50);
    }
    stopScale() {
        clearInterval(scalerTimer);
    }

    async save() {
        const sessions = currentData.filter((item: ScalerSession) => item.avatarId !== this.avatarId) ?? [];
        const newData = [...sessions, this];
        const saved = await Bun.write(filePath, JSON.stringify(newData, null, 2));
        currentData = newData;

        if (!saved) {
            log.error(`Failed saving session: ${JSON.stringify(this)}`);
        }

        return;
    }
    static async fetchSession(avatarId: string): Promise<ScalerSession> {
        if (!currentData) {
            const file = await Bun.file(filePath, { type: "application/json" });

            if (await file.exists()) {
                if ((await file.text()) !== "") {
                    currentData = await file.json();
                } else {
                    currentData = [];
                }
            } else {
                currentData = [];
            }
        }

        const session = new ScalerSession(avatarId);

        if (currentData.length > 0) {
            const sessionData = currentData.find((item: ScalerSession) => item.avatarId === avatarId);

            if (sessionData) {
                session.currentEyeHeight = sessionData.currentEyeHeight;
                session.defaultEyeHeight = sessionData.defaultEyeHeight;
                session.state = sessionData.state;
                session.scaleRate = sessionData.scaleRate;
                session.scaleRateUnit = sessionData.scaleRateUnit;
                session.autoRestoreData = sessionData.autoRestoreData;
            }
        }

        return session;
    }
}