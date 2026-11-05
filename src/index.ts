import {OSCController} from "models/oscController";
import {ScalerSession} from "models/scalerSession";
import { parseArgs } from "util";

const { values } = parseArgs({
    args: Bun.argv,
    options: {
        // Define your argument here (camelCase is recommended for JS object keys)
        "osc-server-port": {
            type: "string",
            default: "9000" // Optional fallback default
        },
    },
    strict: false, // Prevents errors if other unknown flags are passed
});


let currentSession: ScalerSession;
let initialEyeHeight: number = -1;
let oscController = new OSCController();

function loadSession(avatarId: string) {
    ScalerSession.fetchSession(avatarId).then((session) => {
        currentSession = session;
        if (!session.currentEyeHeight) {
            let waitForLoad = setInterval(() => {
                if (initialEyeHeight > 0) return;
                currentSession.currentEyeHeight = initialEyeHeight;
                currentSession.save();
                restoreSession();
                clearInterval(waitForLoad);
            }, 100)
        } else {
            restoreSession();
        }
    })
}
function restoreSession() {
    if (currentSession.state !== 0 && currentSession.currentEyeHeight) {
        currentSession.setScalerState(currentSession.state);
        currentSession.startScale();
    }
}

// Avatar Change Listener
oscController.addEventListener('/avatar/change', (avatarId) => {
    if (typeof avatarId !== "string") return;
    initialEyeHeight = -1;

    if (currentSession) {
        currentSession.save().then(() => {
            currentSession.stopScale();
            loadSession(avatarId);
        });
        return;
    }
    loadSession(avatarId);
})

// Eye Height Listener
oscController.addEventListener('/avatar/eyeheight', (value) => {
    if (!currentSession || typeof value !== "number") return;
    if (!initialEyeHeight) {
        initialEyeHeight = value;
        return;
    }
    currentSession.currentEyeHeight = value;
})

// State Listener
oscController.addEventListener('/avatar/parameters/VRScaler/State', (value) => {
    if (!currentSession || !currentSession.currentEyeHeight || typeof value !== "number") return;
    currentSession.state = value;
    currentSession.startScale();
})

// Rate Listener
oscController.addEventListener('/avatar/parameters/VRScaler/Rate', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value * 100;
    currentSession.save();
})

// Rate Unit Listener
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/Unit', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRateUnit = value * 100;
    currentSession.save();
})

// Meters Rate Listener
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/Meters', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value * 100;
    currentSession.scaleRateUnit = ScalerSession.metersUnit;
    currentSession.save();
})

// Centimeters Rate Listener
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/Centimeters', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value;
    currentSession.scaleRateUnit = ScalerSession.centimetersUnit;
    currentSession.save();
})

// Auto Restore Listener
oscController.addEventListener('/avatar/parameters/VRScaler/Settings/AutoRestore', (value) => {
    if (!currentSession || typeof value !== "boolean") return;
    currentSession.autoRestoreData = value;
    currentSession.save();
})