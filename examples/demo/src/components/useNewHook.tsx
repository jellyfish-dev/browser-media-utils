export type Device = MediaTrackSettings & {
  stream: MediaStream,
  track: MediaStreamTrack,
}

export type DeviceReturnType =
  | { type: "OK"; devices: MediaDeviceInfo[] }
  | { type: "Error"; name: string | null }
  | { type: "Not requested" };

export type Media = {
  stream: MediaStream | null,
  track: MediaStreamTrack | null,
  settings: MediaTrackSettings | null,
};

export type NewHook = {
  audio: DeviceReturnType | { type: "Loading" } | { type: "Requesting" };
  video: DeviceReturnType | { type: "Loading" } | { type: "Requesting" };
  audioMedia: Media | null;
  videoMedia: Media | null;
  // start: (video: boolean | MediaTrackConstraints, audio: boolean | MediaTrackConstraints) => void
};

/**
 * Hook that returns the list of available devices
 *
 * @param video - boolean or MediaTrackConstraints with configuration for video device
 * @param audio - boolean or MediaTrackConstraints with configuration for audio device
 * @returns object containing devices or loading state
 */
