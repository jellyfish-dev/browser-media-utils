import {
  getName,
  getRequestedDeviceSettings,
  isAudio,
  isNotGranted,
  isVideo,
  prepareReturn,
  toMediaTrackConstraints,
} from "./utils";
import { EnumerateDevices } from "./types";

/**
 * Get all available media devices that match provided constraints.
 *
 * @param videoParam - boolean or MediaTrackConstraints with configuration for video device
 * @param audioParam - boolean or MediaTrackConstraints with configuration for audio device
 * @returns Promise with object containing arrays of objects for each kind of media device
 *
 * @example
 * enumerateDevices(true, true).then((devices) => {
 *  console.log(devices);
 * });
 */
export const enumerateDevices = async (
  videoParam: boolean | MediaTrackConstraints,
  audioParam: boolean | MediaTrackConstraints
): Promise<EnumerateDevices> => {
  if (!navigator?.mediaDevices) throw Error("Navigator is available only in secure contexts");

  const objAudio = toMediaTrackConstraints(audioParam);
  const objVideo = toMediaTrackConstraints(videoParam);

  const booleanAudio = !!audioParam;
  const booleanVideo = !!videoParam;

  let mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

  const videoNotGranted = mediaDeviceInfos.filter(isVideo).some(isNotGranted);
  const audioNotGranted = mediaDeviceInfos.filter(isAudio).some(isNotGranted);

  const constraints = {
    video: booleanVideo && videoNotGranted && objVideo,
    audio: booleanAudio && audioNotGranted && objAudio,
  };

  let audioError: string | null = null;
  let videoError: string | null = null;

  const detailedSettings: Array<MediaTrackSettings> = [];

  try {
    if (constraints.audio || constraints.video) {
      const requestedDevices = await navigator.mediaDevices.getUserMedia(constraints);

      mediaDeviceInfos = await navigator.mediaDevices.enumerateDevices();

      requestedDevices.getTracks().forEach((track) => {
        const settings = track.getSettings();
        if (settings.deviceId) {
          detailedSettings.push(settings);
        }
        track.stop();
      });
    }
  } catch (error: unknown) {
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
    const errorName = getName(error);
    videoError = booleanVideo && videoNotGranted ? errorName : null;
    audioError = booleanAudio && audioNotGranted ? errorName : null;
  }

  const videoDevices = mediaDeviceInfos.filter(isVideo);
  const audioDevices = mediaDeviceInfos.filter(isAudio);

  return {
    video: prepareReturn(
      booleanVideo,
      videoDevices,
      videoError,
      getRequestedDeviceSettings(detailedSettings, videoDevices)
    ),
    audio: prepareReturn(
      booleanAudio,
      audioDevices,
      audioError,
      getRequestedDeviceSettings(detailedSettings, audioDevices)
    ),
  };
};
