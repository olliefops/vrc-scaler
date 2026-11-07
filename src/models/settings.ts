import {fetchFile, saveFile} from "utils/filesystem";

const filePath = 'vrc-scaler_settings.json';

export class Settings {
    minEyeHeight: number = 0.5;
    maxEyeHeight: number = 100;

    // Reset Functions
    reset = () => {
        this.minEyeHeight = 0.5;
        this.maxEyeHeight = 100;
    }

    // Data Functions
    save = async () => saveFile(filePath, this)
    static fetch = async (): Promise<Settings> => {
        const currentData = await fetchFile(filePath);
        const settings = new Settings();

        if (currentData) {
            settings.minEyeHeight = currentData.minEyeHeight;
            settings.maxEyeHeight = currentData.maxEyeHeight;
        }

        return settings;
    }
}