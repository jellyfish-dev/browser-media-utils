import { getName, isAudio, isGranted, isVideo, toMediaTrackConstraints } from "./utils";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DeviceReturnType =
  | { type: "OK"; devices: MediaDeviceInfo[] }
  | { type: "Error"; name: string | null }
  | { type: "Not requested" };

export type Media = {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
};

export type NewHook = {
  audio: DeviceReturnType | { type: "Requesting" };
  video: DeviceReturnType | { type: "Requesting" };
  audioMedia: Media | null;
  videoMedia: Media | null;
};

export const prepareReturn = (
  isInterested: boolean,
  mediaDeviceInfo: MediaDeviceInfo[],
  permissionError: string | null
): DeviceReturnType => {
  if (!isInterested) return { type: "Not requested" };
  if (permissionError) return { type: "Error", name: permissionError };
  return {
    type: "OK",
    devices: mediaDeviceInfo.filter(isGranted),
  };
};


export type UseNewHookConfig = {
  getPreviousVideoDevice: () => MediaDeviceInfo | null,
  getPreviousAudioDevice: () => MediaDeviceInfo | null,
}

export type UseNewHookReturn = {
  data: NewHook | null,
  start: (type: "video" | "audio", deviceId: string, constraints: MediaTrackConstraints) => void,
  stop: (type: "video" | "audio") => void,
  init: (videoParam: boolean | MediaTrackConstraints, audioParam: boolean | MediaTrackConstraints) => void,
}

/**
 * Hook that returns the list of available devices
 *
 * @param video - boolean or MediaTrackConstraints with configuration for video device
 * @param audio - boolean or MediaTrackConstraints with configuration for audio device
 * @returns object containing devices or loading state
 */
export const useNewHook = (config: UseNewHookConfig): UseNewHookReturn => {
  const { getPreviousVideoDevice, getPreviousAudioDevice } = useMemo(
    () => config,
    // eslint-disable-next-line
    [])

  const [state, setState] = useState<NewHook>({
    video: { type: "Not requested" },
    audio: { type: "Not requested" },
    audioMedia: null,
    videoMedia: null
  });
  const skip = useRef<boolean>(false);

  const init = useCallback(
    async (videoParam: boolean | MediaTrackConstraints, audioParam: boolean | MediaTrackConstraints) => {
      if (!navigator?.mediaDevices) throw Error("Navigator is available only in secure contexts");
      if (skip.current) return;
      skip.current = true;

      const previousVideoDevice = getPreviousVideoDevice()
      const previousAudioDevice = getPreviousAudioDevice()

      const objAudio = toMediaTrackConstraints(audioParam);
      const objVideo = toMediaTrackConstraints(videoParam);

      const booleanAudio = !!audioParam;
      const booleanVideo = !!videoParam;

      setState((prevState) => ({
        audio: booleanVideo && objVideo ? { type: "Requesting" } : prevState.audio ?? { type: "Not requested" },
        video: booleanAudio && objAudio ? { type: "Requesting" } : prevState.video ?? { type: "Not requested" },
        audioMedia: null,
        videoMedia: null,
      }));

      let requestedDevices: MediaStream | null = null;

      if (previousVideoDevice?.deviceId || previousAudioDevice?.deviceId) {
        console.log("-> Jest device w local storage. Proszę o konkretne urządzenie");
        try {
          const exactConstraints: MediaStreamConstraints = {
            video: booleanVideo && { ...objVideo, deviceId: { exact: previousVideoDevice?.deviceId } },
            audio: booleanAudio && { ...objAudio, deviceId: { exact: previousAudioDevice?.deviceId } },
          };

          console.log({ exactConstraints });

          requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);
        } catch (error: unknown) {
          console.log("-> Nie udało się pobrać użądzenia po ID");
        }
      }

      let audioError: string | null = null;
      let videoError: string | null = null;

      try {
        if (requestedDevices === null) {
          console.log("-> Pobieram dowolne urządzenie");
          const anyDeviceConstraints: MediaStreamConstraints = {
            video: booleanVideo && objVideo,
            audio: booleanAudio && objAudio,
          };
          console.log({ anyDeviceConstraints });

          requestedDevices = await navigator.mediaDevices.getUserMedia(anyDeviceConstraints);
          console.log("-> Pobrano dowolne urządzenie");
        }
      } catch (error: unknown) {
        console.warn("Wystąpił błąd pobierania urządzeń");
        // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
        const errorName = getName(error);
        videoError = booleanVideo ? errorName : null;
        audioError = booleanAudio ? errorName : null;
      }

      const mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

      const currentDevices: { videoinput: MediaDeviceInfo | null; audioinput: MediaDeviceInfo | null } = {
        videoinput: null,
        audioinput: null,
      };

      try {
        if (requestedDevices) {
          requestedDevices.getTracks().forEach((track) => {
            const settings = track.getSettings();
            console.log({ settings });
            if (settings.deviceId) {
              const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId);
              const kind = currentDevice?.kind || null;
              if ((currentDevice && kind && kind === "videoinput") || kind === "audioinput") {
                currentDevices[kind] = currentDevice || null;
              }
            }
          });

          if (
            (previousVideoDevice && currentDevices.videoinput?.deviceId !== previousVideoDevice.deviceId) ||
            currentDevices.videoinput?.label === previousVideoDevice?.label
          ) {
            console.log(
              "-> Pobrane urządzenie nie odpowiada ostatnio używanemu. Szukam pasującego urządzenia po label"
            );
            // eg. Safari

            const videoIdToStart = mediaDeviceInfos.find((info) => info.label === previousVideoDevice?.label)?.deviceId;
            const audioIdToStart = mediaDeviceInfos.find((info) => info.label === previousAudioDevice?.label)?.deviceId;

            if (videoIdToStart || audioIdToStart) {
              console.log("-> Znalazłem pasujące. Wyłączam wszystko");
              requestedDevices.getTracks().forEach((track) => {
                track.stop();
              });

              const exactConstraints: MediaStreamConstraints = {
                video:
                  booleanVideo && !!videoIdToStart ? { ...objVideo, deviceId: { exact: videoIdToStart } } : objVideo,
                audio:
                  booleanAudio && !!audioIdToStart ? { ...objAudio, deviceId: { exact: audioIdToStart } } : objAudio,
              };

              console.log("-> Ponownie pobieram urządzenia");
              console.log({ exactConstraints });
              requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);
            }
          }
        }
      } catch (error: unknown) {
        console.error("-> To sięn powinno wydarzyć");
      }

      const videoDevices = mediaDeviceInfos.filter(isVideo);
      const audioDevices = mediaDeviceInfos.filter(isAudio);

      const videoTrack = requestedDevices?.getVideoTracks()[0] || null;
      const audioTrack = requestedDevices?.getAudioTracks()[0] || null;

      setState({
        video: prepareReturn(booleanVideo, videoDevices, videoError),
        audio: prepareReturn(booleanAudio, audioDevices, audioError),
        audioMedia: {
          stream: requestedDevices,
          track: audioTrack,
        },
        videoMedia: {
          stream: requestedDevices,
          track: videoTrack,
        },
      });
    },
    [getPreviousAudioDevice, getPreviousVideoDevice]
  );

  const start = useCallback(
    async (type: "video" | "audio", deviceId: string, constraints: MediaTrackConstraints) => {
      const name = type === "audio" ? "audioMedia" : "videoMedia";
      // is it safe?
      state?.[name]?.track?.stop();

      const objConstraints = toMediaTrackConstraints(constraints);
      const exactConstraints: MediaStreamConstraints = {
        [type]: { ...objConstraints, deviceId: { exact: deviceId } },
      };

      console.log("-> Pobieram nowe urządzenie");
      console.log({ exactConstraints });
      const requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);

      setState((prevState) => {
        const newMedia: { audioMedia: Media } | { videoMedia: Media } =
          type === "audio"
            ? {
              audioMedia: {
                stream: requestedDevices,
                track: requestedDevices.getAudioTracks()[0] || null,
              },
            }
            : {
              videoMedia: {
                stream: requestedDevices,
                track: requestedDevices.getVideoTracks()[0] || null,
              },
            };

        return { ...prevState, ...newMedia };
      });
    },
    [state]
  );

  const stop = useCallback(async (type: "video" | "audio") => {
    const name = type === "audio" ? "audioMedia" : "videoMedia";

    setState((prevState) => {
      prevState?.[name]?.track?.stop();

      return { ...prevState, [name]: null };
    });
  }, []);

  useEffect(() => {
    console.log({ state });
  }, [state]);

  return useMemo(() => ({
      data: state, start, stop, init
    }),
    [start, state, stop, init])
};
