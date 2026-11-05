import {OSCController} from "models/oscController";
import {ScalerSession} from "models/scalerSession";

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

// Avatar Change Handlers
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

// State Handlers
oscController.addEventListener('/avatar/parameters/VRScaler/State', (value) => {
    if (!currentSession || !currentSession.currentEyeHeight || typeof value !== "number") return;
    currentSession.state = value;
    currentSession.startScale();
})

// Eye Height Handlers
oscController.addEventListener('/avatar/eyeheight', (value) => {
    if (!currentSession || typeof value !== "number") return;
    if (!initialEyeHeight) {
        initialEyeHeight = value;
        return;
    }
    currentSession.currentEyeHeight = value;
})

// Meters Rate Handlers
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/Meters', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value * 100;
    currentSession.scaleRateUnit = ScalerSession.metersUnit;
    currentSession.save();
})
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/MetersPreset', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value;
    currentSession.scaleRateUnit = ScalerSession.metersUnit;
    currentSession.save();
})

// Centimeters Rate Handlers
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/Centimeters', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value;
    currentSession.scaleRateUnit = ScalerSession.centimetersUnit;
    currentSession.save();
})
oscController.addEventListener('/avatar/parameters/VRScaler/Rate/CentimetersPreset', (value) => {
    if (!currentSession || typeof value !== "number") return;
    currentSession.scaleRate = value / 100;
    currentSession.scaleRateUnit = ScalerSession.centimetersUnit;
    currentSession.save();
})

// Auto Restore Handler
oscController.addEventListener('/avatar/parameters/VRScaler/Settings/AutoRestore', (value) => {
    if (!currentSession || typeof value !== "boolean") return;
    currentSession.autoRestoreData = value;
    currentSession.save();
})