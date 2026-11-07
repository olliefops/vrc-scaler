import {fetchFile, saveFile} from "utils/filesystem";

const filePath = 'VRCScaler_Settings.json';

export class ScalerSettings {
    minEyeHeight: number = 0.5;
    maxEyeHeight: number = 100;

    // Reset Functions
    reset = () => {
        this.minEyeHeight = 0.5;
        this.maxEyeHeight = 100;
    }

    // Data Functions
    save = async () => saveFile(filePath, this)
    static fetch = async (): Promise<ScalerSettings> => {
        const currentData = await fetchFile(filePath);
        const settings = new ScalerSettings();

        if (currentData) {
            settings.minEyeHeight = currentData.minEyeHeight;
            settings.maxEyeHeight = currentData.maxEyeHeight;
        }

        return settings;
    }
}