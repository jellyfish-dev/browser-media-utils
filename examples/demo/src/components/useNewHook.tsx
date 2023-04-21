import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getName,
  getRequestedDeviceSettings,
  isAudio,
  isNotGranted,
  isVideo,
  prepareReturn,
  toMediaTrackConstraints,
} from "./utils";
import { DeviceReturnType } from "./types";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "../constraints";

export type NewHook = {
  audio: DeviceReturnType | { type: "Loading" } | { type: "Requesting" };
  video: DeviceReturnType | { type: "Loading" } | { type: "Requesting" };
  // start: (video: boolean | MediaTrackConstraints, audio: boolean | MediaTrackConstraints) => void
};

/**
 * Hook that returns the list of available devices
 *
 * @param video - boolean or MediaTrackConstraints with configuration for video device
 * @param audio - boolean or MediaTrackConstraints with configuration for audio device
 * @returns object containing devices or loading state
 */
export const useNewHook = (
  // video: boolean | MediaTrackConstraints,
  // audio: boolean | MediaTrackConstraints
): NewHook | null => {
  const [state, setState] = useState<NewHook | null>(null);
  const skip = useRef<boolean>(false);

  const start = useCallback(async (videoParam: boolean | MediaTrackConstraints, audioParam: boolean | MediaTrackConstraints) => {
    if (!navigator?.mediaDevices) throw Error("Navigator is available only in secure contexts");
    if (skip.current) return;
    skip.current = true;

    const objAudio = toMediaTrackConstraints(audioParam);
    const objVideo = toMediaTrackConstraints(videoParam);

    const booleanAudio = !!audioParam;
    const booleanVideo = !!videoParam;

    setState(() => ({
      audio: booleanAudio ? { type: "Loading" } : { type: "Not requested" },
      video: booleanVideo ? { type: "Loading" } : { type: "Not requested" },
    }));

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
        setState((prevState) => ({
          audio: constraints.audio ? { type: "Requesting" } : prevState?.audio ?? { type: "Loading" },
          video: constraints.video ? { type: "Requesting" } : prevState?.video ?? { type: "Loading" },
        }));

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

    setState({
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
    });
  }, [])

  useEffect(() => {
    start(VIDEO_TRACK_CONSTRAINTS, AUDIO_TRACK_CONSTRAINTS)
  }, [start]);
  return state
};
