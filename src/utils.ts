import { DeviceReturnType } from "./types";

/*
 * enumerateDevices (permissions not granted)
 * chrome:     {deviceId: '',            kind: 'videoinput',   label: '',     groupId: 'something'}
 * firefox:    {deviceId: 'something',   kind: 'videoinput',   label: '',     groupId: 'something'}
 * safari:     {deviceId: '',            kind: 'videoinput',   label: '',     groupId: ''}
 * safari IOS: {deviceId: '',            kind: 'videoinput',   label: '',     groupId: ''}
 * chrome IOS: {deviceId: '',            kind: 'videoinput',   label: '',     groupId: ''}
 */

export const isGranted = (mediaDeviceInfo: MediaDeviceInfo) =>
  mediaDeviceInfo.label !== "" && mediaDeviceInfo.deviceId !== "";
export const isNotGranted = (mediaDeviceInfo: MediaDeviceInfo) =>
  mediaDeviceInfo.label === "" || mediaDeviceInfo.deviceId === "";
export const isVideo = (it: MediaDeviceInfo) => it.kind === "videoinput";
export const isAudio = (it: MediaDeviceInfo) => it.kind === "audioinput";

export const toMediaTrackConstraints = (
  constraint?: boolean | MediaTrackConstraints
): MediaTrackConstraints | undefined => {
  if (typeof constraint === "boolean") {
    return constraint ? {} : undefined;
  }
  return constraint;
};

export const getName = (obj: unknown): string | null =>
  obj && typeof obj === "object" && "name" in obj && typeof obj.name === "string" ? obj["name"] : null;

export const prepareReturn = (
  isInterested: boolean,
  mediaDeviceInfo: MediaDeviceInfo[],
  permissionError: string | null,
  selectedDeviceSettings: MediaTrackSettings | null
): DeviceReturnType => {
  if (!isInterested) return { type: "Not requested" };
  if (permissionError) return { type: "Error", name: permissionError };
  return { type: "OK", devices: mediaDeviceInfo.filter(isGranted), selectedDeviceSettings };
};

export const getRequestedDeviceSettings = (
  detailedSettings: Array<MediaTrackSettings>,
  deviceIds: MediaDeviceInfo[]
): MediaTrackSettings | null => {
  const videoDeviceIds = deviceIds.map((info) => info.deviceId);

  return detailedSettings.find((settings) => settings.deviceId && videoDeviceIds.includes(settings.deviceId)) || null;
};

export const NOOP = () => {};
