import {Client} from "node-osc";
import {parseArgs} from "util";
import {OSCController} from "models/oscController";
import {ScalerSession} from "models/scalerSession";
import {autocomplete, intro, log, spinner, SpinnerResult, text, isCancel} from '@clack/prompts';

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
    strict: false,
});
export let oscServerState: boolean = false
let oscController: OSCController;
let currentSession: ScalerSession;
let firstEyeHeight: number = -1;
let heartbeatTimeout: NodeJS.Timer;
let isOSCConnected: boolean = false;

export const oscVRC = new Client(params["osc-vrc-host"], params["osc-vrc-port"]);

function avatarDataHandlersInit(loadingSpinner: SpinnerResult) {
    oscController.addEventListener('/avatar/change', async (avatarId) => {
        if (typeof avatarId !== "string" || !avatarId) return;
        firstEyeHeight = -1;

        if (currentSession) {
            currentSession.stopScale();
            await currentSession.save();
        }
        currentSession = await ScalerSession.fetchSession(avatarId);

        if (!currentSession.currentEyeHeight || currentSession.currentEyeHeight < 0) {
            const initializationWait = setInterval(async () => {
                if (firstEyeHeight < 0) return
                currentSession.currentEyeHeight = firstEyeHeight;
                currentSession.defaultEyeHeight = firstEyeHeight;

                clearInterval(initializationWait);
                await currentSession.save();
            }, 100);
        } else if (currentSession.autoRestoreData) {
            currentSession.setEyeHeight(currentSession.currentEyeHeight);
            currentSession.setScaleRateUnit(currentSession.scaleRateUnit)
            currentSession.setScaleRate(currentSession.scaleRate)
            currentSession.setScaleState(currentSession.state)

            if (currentSession.state !== 0) {
                currentSession.startScale();
            }
        }
        currentSession.setAutoRestoreData(currentSession.autoRestoreData)


        if (!isOSCConnected) {
            isOSCConnected = true;
            loadingSpinner.stop('Avatar initialization completed.');
            await startPrompt(loadingSpinner);
        }
    })
    oscController.addEventListener('/avatar/eyeheight', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.state !== 0) return;

        if (firstEyeHeight < 0) {
            firstEyeHeight = value;
            return;
        }
        currentSession.currentEyeHeight = value;
    })
}
function vrcscalerHandlersInit() {
    oscController.addEventListener('/avatar/parameters/VRCScaler/State', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.state === value) return;

        currentSession.state = value;
        currentSession.save();

        if (value === 0) {
            currentSession.stopScale();
            return;
        }
        currentSession.startScale();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Rate', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.scaleRate === (value * 100)) return;
        currentSession.scaleRate = value * 100;
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Rate/Unit', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.scaleRateUnit === value) return;
        currentSession.scaleRateUnit = value;
        currentSession.updateScaleRate();
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Rate/Meters', (value) => {
        if (!currentSession || typeof value !== "number" || value === 0) return;
        currentSession.setScaleRate(value * 100);
        currentSession.setScaleRateUnit(ScalerSession.metersUnit);
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Rate/Centimeters', (value) => {
        if (!currentSession || typeof value !== "number" || value === 0) return;
        currentSession.setScaleRate(value * 100);
        currentSession.setScaleRateUnit(ScalerSession.centimetersUnit);
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Settings/AutoRestore', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (currentSession.autoRestoreData === value) return;
        currentSession.autoRestoreData = value;
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/ResetHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;
        currentSession.resetHeight();
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Settings/Reset', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;
        currentSession.resetSettings();
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Settings/DefaultHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;
        currentSession.defaultEyeHeight = currentSession.currentEyeHeight;
        currentSession.save();
    })
}
function heartbeatHandlersInit() {
    setInterval(() => {
        oscVRC.send('/avatar/parameters/VRCScaler/Heartbeat', ['boolean', true]);
    }, 100);
    oscController.addEventListener('/avatar/parameters/VRCScaler/Heartbeat', (value) => {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = setTimeout(() => {
            if (!currentSession) return;
            currentSession.save().then(() => {
                isOSCConnected = false;
                currentSession.stopScale();
            });
        }, 1000);
    })
}
async function startPrompt(loadingSpinner: SpinnerResult) {
    const action = await autocomplete({
        message: 'Select an action:',
        placeholder: 'Type to search...',
        options: [
            { value: 'divider', label: '── Scale ──' },
            { value: 'grow', label: 'Grow' },
            { value: 'stop', label: 'Stop' },
            { value: 'shrink', label: 'Shrink' },
            { value: 'divider', label: '── Speed ──' },
            { value: 'scaling-rate', label: 'Set Speed', hint: 'Set the scaling speed' },
            { value: 'scaling-unit-meters', label: 'Set Unit: m/s', hint: 'Set the scaling unit to m/s' },
            { value: 'scaling-unit-centimeters', label: 'Set Unit: cm/s', hint: 'Set the scaling unit to cm/s' },
            { value: 'divider', label: '── Settings ──' },
            { value: 'set-default-height', label: 'Set Default Height', hint: `Set the default height to the current height` },
            { value: 'reset-height', label: 'Reset Height' },
            { value: 'reset-settings', label: 'Reset Settings' },
            { value: 'divider', label: '──' },
            { value: 'exit', label: 'Exit' },
        ],
        filter: (search, option) => {
            if (option.value.includes("divider")) return false;
            return !!(option.value.includes(search) || option.hint && option.hint.includes(search));
        }
    });

    if (isCancel(action) || action == 'exit') {
        process.exit(0);
    }

    if (currentSession && isOSCConnected) {
        switch (action) {
            case 'grow':
                currentSession.setScaleState(1);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'shrink':
                currentSession.setScaleState(-1);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'stop':
                currentSession.setScaleState(0);
                currentSession.stopScale();
                await currentSession.save();
                break;
            case 'scaling-rate':
                const rate = await text({
                    message: `Enter scaling rate (${ currentSession.scaleRateUnit === 0 ? 'm/s' : currentSession.scaleRateUnit === 1 ? 'cm/s' : '' }):`
                })
                if (typeof rate !== 'string') break;
                currentSession.setScaleRate(parseFloat(rate));
                await currentSession.save();
                break;
            case 'scaling-unit-meters':
                currentSession.setScaleRateUnit(ScalerSession.metersUnit);
                currentSession.updateScaleRate();
                await currentSession.save();
                break;
            case 'scaling-unit-centimeters':
                currentSession.setScaleRateUnit(ScalerSession.centimetersUnit);
                currentSession.updateScaleRate();
                await currentSession.save();
                break;
            case 'set-default-height':
                currentSession.defaultEyeHeight = currentSession.currentEyeHeight;
                await currentSession.save();
                break;
            case 'reset-height':
                currentSession.resetHeight();
                await currentSession.save();
                break;
            case 'reset-settings':
                currentSession.resetSettings();
                await currentSession.save();
                break;
        }
    }

    if (!currentSession || !isOSCConnected) {
        log.error('Failed to connect to avatar.');
        loadingSpinner.start('Waiting for avatar initialization');
    } else {
        await startPrompt(loadingSpinner);
    }
}

intro('VRCScaler')
oscController = new OSCController(() => {
    const loadingSpinner = spinner()
    loadingSpinner.start('Waiting for avatar initialization.');
    avatarDataHandlersInit(loadingSpinner);
    vrcscalerHandlersInit();
    heartbeatHandlersInit();
})