# VRCScaler

## OSC Endpoints

| Address | Description | Value |
| --- | --- | --- |
| /VRCScaler/State | Set the scaling state. | float: -1 (shrink), 0 (stopped), 1 (grow) |
| /VRCScaler/Rate/Meters | Set the scaling rate in meters. | float: 0-1 x 100 |
| /VRCScaler/Rate/Centimeters | Set the scaling rate in centimeters. | float: 0-1 |
| /VRCScaler/Settings/AutoRestore | Set whether to automatically restore the avatar scaling session when reloading the avatar. | boolean |
