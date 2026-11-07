import {oscVRChat} from "@/index";
import {fetchFile, saveFile} from "utils/filesystem";
import {ScalerSettings} from "models/scalerSettings";

const filePath = 'VRCScaler_Sessions.json';

let scalerTimer: NodeJS.Timer | undefined;

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
        oscVRChat.send('/avatar/eyeheight', {
            type: 'float',
            value: value
        })
    }
    setScaleState(value: number) {
        this.state = value;
        oscVRChat.send('/avatar/parameters/VRCScaler/State', {
            type: 'float',
            value: value
        });
    }
    setScaleRate(value: number) {
        this.scaleRate = value;
        oscVRChat.send('/avatar/parameters/VRCScaler/Rate', {
            type: 'float',
            value: value / 100
        });
    }
    setScaleRateUnit(value: number) {
        this.scaleRateUnit = value;
        oscVRChat.send('/avatar/parameters/VRCScaler/Rate/Unit', {
            type: 'float',
            value: value
        });
    }
    setAutoRestore(value: boolean) {
        this.autoRestore = value;
        oscVRChat.send('/avatar/parameters/VRCScaler/Settings/AutoRestore', {
            type: 'boolean',
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

    // Reset Functions
    reset() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setEyeHeight(this.defaultEyeHeight);
        this.setScaleRateUnit(ScalerSession.metersUnit)
        this.setScaleState(ScalerSession.stopState);
        this.setScaleRate(1);
    }
    resetHeight() {
        if (!this.defaultEyeHeight) return;
        this.stopScale();
        this.setScaleState(ScalerSession.stopState);
        this.setEyeHeight(this.defaultEyeHeight);
    }

    // Scale Controllers
    startScale() {
        if (this.state === 0 || !this.currentEyeHeight || !this.scaleRate) return;
        if (scalerTimer) clearInterval(scalerTimer);

        ScalerSettings.fetch().then(settings => {
            scalerTimer = setInterval(() => {
                if (!this.currentEyeHeight || !this.scaleRate) return;

                if (this.state === 0) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setScaleState(ScalerSession.stopState);
                    return;
                }

                if (this.state === -1 && this.currentEyeHeight <= settings.minEyeHeight) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setEyeHeight(settings.minEyeHeight);
                    this.setScaleState(ScalerSession.stopState);
                    return;
                }

                if (this.state === 1 && this.currentEyeHeight >= settings.maxEyeHeight) {
                    if (scalerTimer) clearInterval(scalerTimer);
                    this.setEyeHeight(settings.maxEyeHeight);
                    this.setScaleState(ScalerSession.stopState);
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
        const sessions = currentData.filter((item: ScalerSession) => item.avatarId !== this.avatarId) ?? [];
        await saveFile(filePath, [...sessions, this]);
    }
    static async fetch(avatarId: string): Promise<ScalerSession> {
        const session = new ScalerSession(avatarId);
        const currentData = (await fetchFile(filePath)) ?? [];

        const sessionData = currentData.find((item: ScalerSession) => item.avatarId === avatarId);
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