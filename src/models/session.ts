import {oscClient} from "@/index";
import {fetchFile, saveFile} from "utils/filesystem";
import {Settings} from "models/settings";

const filePath = 'vrc-scaler_sessions.json';
let scalerTimer: NodeJS.Timeout | undefined;

export class Session {
    // Avatar Data
    avatarId: string;
    currentEyeHeight?: number;
    defaultEyeHeight?: number;

    // Scaling Data
    state: number = 0;
    scaleRate: number = 1;
    scaleRateUnit: number = 0; // 0: meters, 1: centimeters

    // Session Settings
    autoRestore: boolean = false;

    // Units
    static metersUnit = 0;
    static centimetersUnit = 1;

    // States
    static growState = 1;
    static stopState = 0;
    static shrinkState = -1;

    constructor(avatarId: string) {
        this.avatarId = avatarId;
    }

    // Setter Functions
    setEyeHeight(value: number) {
        this.currentEyeHeight = value;
        oscClient.send('/avatar/eyeheight', {
            type: 'float',
            value: value
        })
    }
    setScaleState(value: number) {
        this.state = value;
        oscClient.send('/avatar/parameters/VRCScaler/State', {
            type: 'float',
            value: value
        });
    }
    setScaleRate(value: number) {
        this.scaleRate = value;
        oscClient.send('/avatar/parameters/VRCScaler/Rate', {
            type: 'float',
            value: value / 100
        });
    }
    setScaleRateUnit(value: number) {
        this.scaleRateUnit = value;
        oscClient.send('/avatar/parameters/VRCScaler/Rate/Unit', {
            type: 'float',
            value: value
        });
    }
    setAutoRestore(value: boolean) {
        this.autoRestore = value;
        oscClient.send('/avatar/parameters/VRCScaler/Settings/AutoRestore', {
            type: 'boolean',
            value: value
        });
    }
    updateScaleRate() {
        if (this.scaleRateUnit === Session.metersUnit) {
            this.setScaleRate(this.scaleRate / 100);
            return;
        }
        if (this.scaleRateUnit === Session.centimetersUnit) {
            this.setScaleRate(this.scaleRate * 100);
            return;
        }
    }

    // Reset Functions
    reset() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setEyeHeight(this.defaultEyeHeight);
        this.setScaleRateUnit(Session.metersUnit)
        this.setScaleState(Session.stopState);
        this.setScaleRate(1);
    }
    resetHeight() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setScaleState(Session.stopState);
        this.setEyeHeight(this.defaultEyeHeight);
    }

    // Scale Controllers
    startScale() {
        if (this.state === 0 || !this.currentEyeHeight || !this.scaleRate) return;
        if (scalerTimer) clearInterval(scalerTimer);

        Settings.fetch().then(settings => {
            scalerTimer = setInterval(() => {
                if (!this.currentEyeHeight || !this.scaleRate) return;

                if (this.state === 0) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setScaleState(Session.stopState);
                    return;
                }

                if (this.state === -1 && this.currentEyeHeight <= settings.minEyeHeight) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setEyeHeight(settings.minEyeHeight);
                    this.setScaleState(Session.stopState);
                    return;
                }

                if (this.state === 1 && this.currentEyeHeight >= settings.maxEyeHeight) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setEyeHeight(settings.maxEyeHeight);
                    this.setScaleState(Session.stopState);
                    return;
                }

                // Current Eye Height + State (-1/1) * ( ScaleRate (meters / centimeters) / 100 (iterations per second) )
                let nextEyeHeight = this.currentEyeHeight + this.state * ( ( this.scaleRateUnit == 0 ? this.scaleRate : this.scaleRate / 100 ) / 100 );
                this.setEyeHeight(Math.min(Math.max(nextEyeHeight, settings.minEyeHeight), settings.maxEyeHeight));
            }, 1000 / 100);
        })
    }
    stopScale() {
        if (scalerTimer) clearInterval(scalerTimer);
    }

    // Data Functions
    async save() {
        const currentData = (await fetchFile(filePath)) ?? [];
        const sessions = currentData.filter((item: Session) => item.avatarId !== this.avatarId) ?? [];
        await saveFile(filePath, [...sessions, this]);
    }
    static async fetch(avatarId: string): Promise<Session> {
        const session = new Session(avatarId);
        const currentData = (await fetchFile(filePath)) ?? [];

        const sessionData = currentData.find((item: Session) => item.avatarId === avatarId);
        if (sessionData) {
            session.currentEyeHeight = sessionData.currentEyeHeight;
            session.defaultEyeHeight = sessionData.defaultEyeHeight;
            session.state = sessionData.state;
            session.scaleRate = sessionData.scaleRate;
            session.scaleRateUnit = sessionData.scaleRateUnit;
            session.autoRestore = sessionData.autoRestore;
        }

        return session;
    }
}