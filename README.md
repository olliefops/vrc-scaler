# VRCScaler

This is a VRChat scaling tool that allows more control and predictable avatar scaling. 
It uses the metric system instead of relative compared to other scaling system. And allows session restoration to allow extended sessions over multiple VRChat instances or sessions.

## Features

- **Metric scaling (meters/centimeters)**: Allows you precision for fast and slow speeds.
- **Interactive shell**: Control outside VRC to set the scaling parameters the need to re-upload your avatar.
- **Auto restoration**: Allows you to restore the avatar scaling session when the avatar is reloaded.

## Available OSC Endpoints

| Address | Description | Value |
| --- | --- | --- |
| /VRCScaler/State | Set the scaling state. | float (Synced): -1 (shrink), 0 (stopped), 1 (grow) |
| /VRCScaler/Rate | Set the scaling rate. | float (Synced) |
| /VRCScaler/Rate/Unit | Set the scaling rate unit. | float (Synced): 0 (meters), 1 (centimeters) |
| /VRCScaler/Rate/Meters | Set the scaling rate in meters. | float (Not Synced): 0-1 |
| /VRCScaler/Rate/Centimeters (W) | Set the scaling rate in centimeters. | float (Not Synced): 0-1 |
| /VRCScaler/ResetHeight | Reset the avatar height to the defined default height. | boolean (Not Synced) |
| /VRCScaler/Settings/AutoRestore | Set whether to automatically restore the avatar scaling session when reloading the avatar. | boolean (Synced) |
| /VRCScaler/Settings/ResetHeight | Set the default height to the current height of the avatar. (defined on first avatar load) | boolean (Not Synced) |
