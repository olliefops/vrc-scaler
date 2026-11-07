import {Client} from "node-osc";
import {parseArgs} from "util";
import {OSCController} from "models/oscController";
import {ScalerSession} from "models/scalerSession";
import {autocomplete, intro, log, spinner, SpinnerResult, text, isCancel} from '@clack/prompts';
import {ScalerSettings} from "models/scalerSettings";

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

let oscVRChat: Client;
let promptController: AbortController;
let oscController: OSCController;
let currentSession: ScalerSession;
let firstEyeHeight: number = -1;
let heartbeatTimeout: NodeJS.Timer;
let isOSCConnected: boolean = false;
let shellCurrentValue: string = '';

const startAvatarHandlers = () => {
    oscController.addEventListener('/avatar/change', async (avatarId) => {
        if (typeof avatarId !== "string" || !avatarId) return;
        firstEyeHeight = -1;

        if (currentSession) {
            currentSession.stopScale();
            await currentSession.save();
        }
        currentSession = await ScalerSession.fetch(avatarId);

        if (!currentSession.currentEyeHeight || currentSession.currentEyeHeight < 0 || !currentSession.autoRestore) {
            const initializationWait = setInterval(async () => {
                if (firstEyeHeight < 0) return
                currentSession.currentEyeHeight = firstEyeHeight;

                if (!currentSession.defaultEyeHeight) {
                    currentSession.defaultEyeHeight = firstEyeHeight;
                }

                clearInterval(initializationWait);
                await currentSession.save();
            }, 100);
        }

        if (currentSession.autoRestore) {
            currentSession.setScaleRateUnit(currentSession.scaleRateUnit)
            currentSession.setScaleRate(currentSession.scaleRate)

            if (currentSession.currentEyeHeight) {
                currentSession.setEyeHeight(currentSession.currentEyeHeight);
            }

            currentSession.setScaleState(currentSession.state)
            if (currentSession.state !== ScalerSession.stopState) {
                currentSession.startScale();
            }
        }
        currentSession.setAutoRestore(currentSession.autoRestore ?? false)
    })
    oscController.addEventListener('/avatar/eyeheight', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.state !== ScalerSession.stopState) return;

        if (firstEyeHeight < 0) {
            firstEyeHeight = value;
            return;
        }
        currentSession.currentEyeHeight = value;
    })
}
const startVRCHandlers = (loadingSpinner: SpinnerResult)=> {
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
        if (currentSession.autoRestore === value) return;
        currentSession.autoRestore = value;
        currentSession.save();
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/ResetHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.resetHeight();
        currentSession.save();
        oscVRChat.send('/avatar/parameters/VRCScaler/ResetHeight', {
            type: 'boolean',
            value: false
        });
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Settings/Reset', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.reset();
        currentSession.save();
        oscVRChat.send('/avatar/parameters/VRCScaler/Settings/Reset', {
            type: 'boolean',
            value: false
        });
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Settings/DefaultHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.defaultEyeHeight = currentSession.currentEyeHeight;
        currentSession.save();
        oscVRChat.send('/avatar/parameters/VRCScaler/Settings/DefaultHeight', {
            type: 'boolean',
            value: false
        });
    })
    oscController.addEventListener('/avatar/parameters/VRCScaler/Heartbeat', async () => {
        clearTimeout(heartbeatTimeout);

        if (!isOSCConnected && currentSession) {
            isOSCConnected = true;
            loadingSpinner.stop('OSC: Connected');
            await startShell(loadingSpinner);
        }

        heartbeatTimeout = setTimeout(() => {
            if (!currentSession || !isOSCConnected) return;
            isOSCConnected = false;
            promptController.abort();

            if (!currentSession.autoRestore) currentSession.state = ScalerSession.stopState;
            currentSession.stopScale();

            currentSession.save().then(() => {
                log.warn('OSC: Connection lost');
                loadingSpinner.start('OSC: Waiting for connection');
            });
        }, 1000);
    })
    setInterval(() => {
        oscVRChat.send('/avatar/parameters/VRCScaler/Heartbeat', ['boolean', true]);
    }, 100);
}
const startShell = async (loadingSpinner: SpinnerResult)=> {
    const settings = await ScalerSettings.fetch();
    promptController = new AbortController();

    const action = await autocomplete({
        message: 'Select an action:',
        placeholder: 'Type to search...',
        initialValue: shellCurrentValue,
        options: [
            { value: 'divider1', label: '── Scale ──' },
            { value: 'grow', label: 'Grow' },
            { value: 'stop', label: 'Stop' },
            { value: 'shrink', label: 'Shrink' },
            { value: 'divider2', label: '── Speed ──' },
            { value: 'scaling-rate', label: 'Set Speed', hint: 'Set the scaling speed' },
            { value: 'scaling-unit-meters', label: 'Set Unit: m/s', hint: 'Set the scaling unit to m/s' },
            { value: 'scaling-unit-centimeters', label: 'Set Unit: cm/s', hint: 'Set the scaling unit to cm/s' },
            { value: 'divider3', label: '── Session Settings ──' },
            { value: 'set-default-height', label: 'Set Default Height', hint: `Set the default height to the current height` },
            { value: 'reset-height', label: 'Reset Height' },
            { value: 'reset-session-settings', label: 'Reset Session Settings' },
            { value: 'divider4', label: '── VRCScaler Settings ──' },
            { value: 'min-height', label: 'Set Minimum Height' },
            { value: 'max-height', label: 'Set Maximum Height' },
            { value: 'reset-vrcscaler-settings', label: 'Reset VRCScaler Settings' },
            { value: 'divider5', label: '──' },
            { value: 'exit', label: 'Exit' },
        ],
        signal: promptController.signal,
        filter: (search, option) => {
            if (option.value.includes("divider")) return false;
            return !!(option.value.includes(search) || option.hint && option.hint.includes(search));
        }
    });

    let value;
    if (typeof action === 'string') shellCurrentValue = action;
    if (currentSession && isOSCConnected) {
        switch (action) {
            case 'grow':
                currentSession.setScaleState(ScalerSession.growState);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'shrink':
                currentSession.setScaleState(ScalerSession.shrinkState);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'stop':
                currentSession.setScaleState(ScalerSession.stopState);
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
            case 'reset-session-settings':
                currentSession.reset();
                await currentSession.save();
                break;
            case 'reset-height':
                currentSession.resetHeight();
                await currentSession.save();
                break;
            case 'min-height':
                value = await text({ message: "Enter minimum height (in meters):" })
                if (typeof value !== 'string') break;
                settings.minEyeHeight = parseFloat(value);
                await settings.save();
                break;
            case 'max-height':
                value = await text({ message: "Enter maximum height (in meters):" })
                if (typeof value !== 'string') break;
                settings.maxEyeHeight = parseFloat(value);
                await settings.save();
                break;
            case 'reset-vrcscaler-settings':
                settings.reset();
                await settings.save();
                break;
            case 'exit':
                process.exit(0);
        }
    }

    if (currentSession && isOSCConnected) {
        await startShell(loadingSpinner);
    }
}

if (typeof params["osc-vrc-host"] !== 'string' || typeof params["osc-vrc-port"] !== 'string') process.exit(1);
oscVRChat = new Client(params["osc-vrc-host"], parseInt(params["osc-vrc-port"]));

intro(`VRCScaler v${process.env.npm_package_version}`)
oscController = new OSCController(async () => {
    const loadingSpinner = spinner()
    loadingSpinner.start('OSC: Waiting for connection');
    startAvatarHandlers();
    startVRCHandlers(loadingSpinner);
})

export { oscVRChat }