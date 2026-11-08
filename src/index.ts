import {Client} from "node-osc";
import {parseArgs} from "util";
import {OscServer} from "models/oscServer";
import {Session} from "models/session";
import {autocomplete, intro, log, spinner, SpinnerResult, text, isCancel} from '@clack/prompts';
import {Settings} from "models/settings";

// Launch Args
const { values: params } = parseArgs({
    options: {
        "osc-client-host": {
            type: "string",
            default: "127.0.0.1"
        },
        "osc-client-port": {
            type: "string",
            default: "9000"
        },
        "osc-server-host": {
            type: "string",
            default: "127.0.0.1"
        },
        "osc-server-port": {
            type: "string",
            default: "9001"
        }
    },
    strict: false,
});

// Session
let currentSession: Session;
let firstEyeHeight: number = -1;

// OSC
let oscClient: Client;
let oscServer: OscServer;
let isOSCConnected: boolean = false;
let heartbeatTimeout: NodeJS.Timeout;

// Shell
let shellCurrentValue: string = '';
let promptController: AbortController;

const startAvatarHandlers = () => {
    oscServer.addEventListener('/avatar/change', async (avatarId) => {
        if (typeof avatarId !== "string" || !avatarId) return;
        firstEyeHeight = -1;

        if (currentSession) {
            currentSession.stopScale();
            await currentSession.save();
        }
        currentSession = await Session.fetch(avatarId);

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
            if (currentSession.state !== Session.stopState) {
                currentSession.startScale();
            }
        }
        currentSession.setAutoRestore(currentSession.autoRestore ?? false)
    })
    oscServer.addEventListener('/avatar/eyeheight', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.state !== Session.stopState) return;

        if (firstEyeHeight < 0) {
            firstEyeHeight = value;
            return;
        }
        currentSession.currentEyeHeight = value;
    })
}
const startVRCHandlers = (loadingSpinner: SpinnerResult)=> {
    oscServer.addEventListener('/avatar/parameters/VRCScaler/State', (value) => {
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
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Rate', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.scaleRate === (value * 100)) return;
        currentSession.scaleRate = value * 100;
        currentSession.save();
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Rate/Unit', (value) => {
        if (!currentSession || typeof value !== "number") return;
        if (currentSession.scaleRateUnit === value) return;
        currentSession.scaleRateUnit = value;
        currentSession.updateScaleRate();
        currentSession.save();
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Rate/Meters', (value) => {
        if (!currentSession || typeof value !== "number" || value === 0) return;
        currentSession.setScaleRate(value * 100);
        currentSession.setScaleRateUnit(Session.metersUnit);
        currentSession.save();
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Rate/Centimeters', (value) => {
        if (!currentSession || typeof value !== "number" || value === 0) return;
        currentSession.setScaleRate(value * 100);
        currentSession.setScaleRateUnit(Session.centimetersUnit);
        currentSession.save();
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Settings/AutoRestore', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (currentSession.autoRestore === value) return;
        currentSession.autoRestore = value;
        currentSession.save();
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/ResetHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.resetHeight();
        currentSession.save();
        oscClient.send('/avatar/parameters/VRCScaler/ResetHeight', {
            type: 'boolean',
            value: false
        });
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Settings/Reset', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.reset();
        currentSession.save();
        oscClient.send('/avatar/parameters/VRCScaler/Settings/Reset', {
            type: 'boolean',
            value: false
        });
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Settings/DefaultHeight', (value) => {
        if (!currentSession || typeof value !== "boolean") return;
        if (!value) return;

        currentSession.defaultEyeHeight = currentSession.currentEyeHeight;
        currentSession.save();
        oscClient.send('/avatar/parameters/VRCScaler/Settings/DefaultHeight', {
            type: 'boolean',
            value: false
        });
    })
    oscServer.addEventListener('/avatar/parameters/VRCScaler/Heartbeat', async () => {
        clearTimeout(heartbeatTimeout);

        if (!isOSCConnected && currentSession) {
            isOSCConnected = true;
            loadingSpinner.stop('Connected');
            await startShell(loadingSpinner);
        }

        heartbeatTimeout = setTimeout(() => {
            if (!currentSession || !isOSCConnected) return;
            isOSCConnected = false;
            promptController.abort();

            if (!currentSession.autoRestore) currentSession.state = Session.stopState;
            currentSession.stopScale();

            currentSession.save().then(() => {
                log.warn('Connection lost');
                loadingSpinner.start('Waiting for connection');
            });
        }, 1000);
    })
    setInterval(() => {
        oscClient.send('/avatar/parameters/VRCScaler/Heartbeat', ['boolean', true]);
    }, 100);
}
const startShell = async (loadingSpinner: SpinnerResult)=> {
    if (promptController) promptController.abort();
    const settings = await Settings.fetch();
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
                currentSession.setScaleState(Session.growState);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'shrink':
                currentSession.setScaleState(Session.shrinkState);
                currentSession.startScale();
                await currentSession.save();
                break;
            case 'stop':
                currentSession.setScaleState(Session.stopState);
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
                currentSession.setScaleRateUnit(Session.metersUnit);
                currentSession.updateScaleRate();
                await currentSession.save();
                break;
            case 'scaling-unit-centimeters':
                currentSession.setScaleRateUnit(Session.centimetersUnit);
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
                value = await text({ message: "Enter minimum height (m):" })
                if (typeof value !== 'string') break;
                settings.minEyeHeight = parseFloat(value);
                await settings.save();
                break;
            case 'max-height':
                value = await text({ message: "Enter maximum height (m):" })
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

if (typeof params["osc-client-host"] !== 'string' || typeof params["osc-client-port"] !== 'string') process.exit(1);
if (typeof params["osc-server-port"] !== "string" || typeof params["osc-server-host"] !== "string") process.exit(1);

intro(`VRCScaler`)

oscClient = new Client(params["osc-client-host"], parseInt(params["osc-client-port"]));
oscServer = new OscServer(params["osc-server-host"], parseInt(params["osc-server-port"]), async () => {
    log.success(
        `OSC: Server started on ${params["osc-server-host"]}:${params["osc-server-port"]}\n`+
        `OSC: Sending messages to VRC on ${params["osc-client-host"]}:${params["osc-client-port"]}`
    )

    const loadingSpinner = spinner()
    loadingSpinner.start('Waiting for connection');
    startAvatarHandlers();
    startVRCHandlers(loadingSpinner);
})

export { oscClient }