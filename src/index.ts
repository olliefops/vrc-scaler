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
let initialEyeHeight: number = -1;
let heartbeatTimeout: NodeJS.Timer;
let isOSCConnected: boolean = false;

export const oscVRC = new Client(params["osc-vrc-host"], params["osc-vrc-port"]);

function loadSession(avatarId: string) {
    ScalerSession.fetchSession(avatarId).then((session) => {
        currentSession = session;

        if (!currentSession.currentEyeHeight || currentSession.currentEyeHeight < 0) {
            const waitForLoad = setInterval(() => {
                if (initialEyeHeight < 0) return;
                currentSession.setEyeHeight(initialEyeHeight);
                currentSession.save();
                clearInterval(waitForLoad);
                restoreSession();
            }, 100)
        } else if (currentSession.currentEyeHeight && currentSession.currentEyeHeight > 0) {
            restoreSession();
        }
    })
}
function restoreSession() {
    if (!currentSession.currentEyeHeight) return;
    currentSession.setEyeHeight(currentSession.currentEyeHeight);
    currentSession.setScaleRateUnit(currentSession.scaleRateUnit)
    currentSession.setScaleRate(currentSession.scaleRate)
    currentSession.setScaleState(currentSession.state)
    if (currentSession.state === 0) return;
    currentSession.startScale();
}
function avatarDataHandlersInit(loadingSpinner: SpinnerResult) {
    oscController.addEventListener('/avatar/change', (avatarId) => {
        if (typeof avatarId !== "string") return;
        initialEyeHeight = -1;

        if (currentSession) {
            isOSCConnected = true;
            currentSession.stopScale();
            currentSession.save().then(() => {
                loadSession(avatarId);
                isOSCConnected = true;
                loadingSpinner.stop('Avatar initialization completed.');
                startShell(loadingSpinner);
            });
            return;
        }

        loadSession(avatarId);
        isOSCConnected = true;
        loadingSpinner.stop('Avatar initialization completed.');
        startShell(loadingSpinner);
    })
    oscController.addEventListener('/avatar/eyeheight', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (initialEyeHeight == -1) {
            initialEyeHeight = value;
            return;
        }
        currentSession.currentEyeHeight = value;
    })
    oscController.addEventListener('/avatar/parameters/ScaleFactor', (value) => {
        if (!currentSession || typeof value !== "number" || currentSession.defaultEyeHeight) return;
        const waitForLoad = setInterval(() => {
            if (!currentSession.currentEyeHeight) return;
            currentSession.defaultEyeHeight = currentSession.currentEyeHeight / value;
            currentSession.save();
            clearInterval(waitForLoad);
        }, 100)
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
async function startShell(loadingSpinner: SpinnerResult) {
    const action = await autocomplete({
        message: 'Select an action:',
        placeholder: 'Type to search...',
        options: [
            { value: 'divider', label: '── Scale ──' },
            { value: 'grow', label: 'Grow' },
            { value: 'stop', label: 'Stop' },
            { value: 'shrink', label: 'Shrink' },
            { value: 'divider', label: '── Speed ──' },
            { value: 'scaling-rate', label: 'Speed', hint: 'Set the scaling speed' },
            { value: 'scaling-unit-meters', label: 'Unit: m/s', hint: 'Set the scaling unit to m/s' },
            { value: 'scaling-unit-centimeters', label: 'Unit: cm/s', hint: 'Set the scaling unit to cm/s' },
            { value: 'divider', label: '── Settings ──' },
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
                break;
            case 'shrink':
                currentSession.setScaleState(-1);
                currentSession.startScale();
                break;
            case 'stop':
                currentSession.setScaleState(0);
                currentSession.stopScale();
                break;
            case 'scaling-rate':
                const rate = await text({
                    message: `Enter scaling rate (${ currentSession.scaleRateUnit === 0 ? 'm/s' : currentSession.scaleRateUnit === 1 ? 'cm/s' : '' }):`
                })
                if (typeof rate !== 'string') break;
                currentSession.setScaleRate(parseFloat(rate));
                break;
            case 'scaling-unit-meters':
                currentSession.setScaleRateUnit(ScalerSession.metersUnit);
                currentSession.updateScaleRate();
                break;
            case 'scaling-unit-centimeters':
                currentSession.setScaleRateUnit(ScalerSession.centimetersUnit);
                currentSession.updateScaleRate();
                break;
            case 'reset-height':
                currentSession.resetHeight();
                break;
            case 'reset-settings':
                currentSession.resetSettings();
                break;
        }
    }

    if (!currentSession || !isOSCConnected) {
        log.error('Failed to connect to avatar.');
        loadingSpinner.start('Waiting for avatar initialization');
    } else {
        startShell(loadingSpinner);
    }
}

function init() {
    intro('VRCScaler')
    oscController = new OSCController(() => {
        const loadingSpinner = spinner()
        loadingSpinner.start('Waiting for avatar initialization.');
        avatarDataHandlersInit(loadingSpinner);
        vrcscalerHandlersInit();
        heartbeatHandlersInit();
    })
}

init();