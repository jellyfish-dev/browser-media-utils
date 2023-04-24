import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadObject, removeSavedItem, saveObject } from "../localStorageUtils";
import { DeviceReturnType, Media, NewHook } from "./useNewHook";
import {
  getName,
  getRequestedDeviceSettings,
  isAudio, isGranted,
  isVideo,
  toMediaTrackConstraints
} from "./utils";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "../constraints";

export const prepareReturn = (
  isInterested: boolean,
  mediaDeviceInfo: MediaDeviceInfo[],
  permissionError: string | null,
): DeviceReturnType => {
  if (!isInterested) return { type: "Not requested" };
  if (permissionError) return { type: "Error", name: permissionError };
  return {
    type: "OK",
    devices: mediaDeviceInfo.filter(isGranted),
  };
};

export const App = () => {
  const [localStorageDevices, setLocalStorageDevices] = useState(() => loadObject<MediaDeviceInfo[]>("devices", []))
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [mediaDeviceInfo, setMediaDeviceInfo] = useState<MediaDeviceInfo[] | null>(null)
  const [videoId, setVideoId] = useState<string>("")

  const [previousVideoDevice, setPreviousVideoDevice] = useState<MediaDeviceInfo | null>(() => loadObject("video", null))
  const [previousAudioDevice, setPreviousAudioDevice] = useState<MediaDeviceInfo | null>(() => loadObject("audio", null))

  const [audioDeviceLabelInput, setAudioDeviceLabelInput] = useState<string>("")
  const [audioDeviceIdInput, setAudioDeviceIdInput] = useState<string>("")

  const [videoDeviceLabelInput, setVideoDeviceLabelInput] = useState<string>("")
  const [videoDeviceIdInput, setVideoDeviceIdInput] = useState<string>("")

  useEffect(() => {
    const audio = loadObject<MediaDeviceInfo | null>("audio", null)
    if (audio) {
      setAudioDeviceIdInput(audio.deviceId)
      setAudioDeviceLabelInput(audio.label)
    }

    const video = loadObject<MediaDeviceInfo | null>("video", null)
    if (video) {
      setVideoDeviceIdInput(video.deviceId)
      setVideoDeviceLabelInput(video.label)
    }
  }, [])

  const [state, setState] = useState<NewHook | null>(null);
  const skip = useRef<boolean>(false);

  const start = useCallback(async (
    videoParam: boolean | MediaTrackConstraints,
    audioParam: boolean | MediaTrackConstraints,
  ) => {
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
      audioMedia: null,
      videoMedia: null,
    }));

    const detailedSettings: Array<MediaTrackSettings> = [];

    setState((prevState) => ({
      audio: booleanVideo && objVideo ? { type: "Requesting" } : prevState?.audio ?? { type: "Loading" },
      video: booleanAudio && objAudio ? { type: "Requesting" } : prevState?.video ?? { type: "Loading" },
      audioMedia: null,
      videoMedia: null,
    }));

    let requestedDevices: MediaStream | null = null

    if (previousVideoDevice?.deviceId || previousAudioDevice?.deviceId) {
      console.log("-> Jest device w local storage. Proszę o konkretne urządzenie")
      try {
        const exactConstraints: MediaStreamConstraints = {
          video: booleanVideo && { ...objVideo, deviceId: { exact: previousVideoDevice?.deviceId } },
          audio: booleanAudio && { ...objAudio, deviceId: { exact: previousAudioDevice?.deviceId } },
        };

        console.log({ exactConstraints })

        requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);
      } catch (error: unknown) {
        console.log("-> Nie udało się pobrać użądzenia po ID")
      }
    }

    let audioError: string | null = null;
    let videoError: string | null = null;

    try {
      if (requestedDevices === null) {
        console.log("-> Pobieram dowolne urządzenie")
        const anyDeviceConstraints: MediaStreamConstraints = {
          video: booleanVideo && objVideo,
          audio: booleanAudio && objAudio,
        };
        console.log({ anyDeviceConstraints })

        requestedDevices = await navigator.mediaDevices.getUserMedia(anyDeviceConstraints);
        console.log("-> Pobrano dowolne urządzenie")
      }
    } catch (error: unknown) {
      console.warn("Wystąpił błąd pobierania urządzeń")
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
      const errorName = getName(error);
      videoError = booleanVideo ? errorName : null;
      audioError = booleanAudio ? errorName : null;
    }

    const mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

    const currentDevices: { videoinput: MediaDeviceInfo | null, audioinput: MediaDeviceInfo | null } = {
      videoinput: null,
      audioinput: null,
    }

    try {
      if (requestedDevices) {
        requestedDevices.getTracks().forEach((track) => {
          const settings = track.getSettings();
          console.log({ settings })
          if (settings.deviceId) {
            detailedSettings.push(settings);
            const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId)
            const kind = currentDevice?.kind || null
            if (currentDevice && kind && kind === "videoinput" || kind === "audioinput") {
              currentDevices[kind] = currentDevice || null
            }
          }
        });

        if (previousVideoDevice && (currentDevices.videoinput?.deviceId !== previousVideoDevice.deviceId) || (currentDevices.videoinput?.label === previousVideoDevice?.label)) {
          console.log("-> Pobrane urządzenie nie odpowiada ostatnio używanemu. Szukam pasującego urządzenia po label")
          // eg. Safari

          const videoIdToStart = mediaDeviceInfos.find((info) => info.label === previousVideoDevice?.label)?.deviceId
          const audioIdToStart = mediaDeviceInfos.find((info) => info.label === previousAudioDevice?.label)?.deviceId

          if (videoIdToStart || audioIdToStart) {
            console.log("-> Znalazłem pasujące. Wyłączam wszystko")
            requestedDevices.getTracks().forEach((track) => {
              track.stop();
            });

            const exactConstraints: MediaStreamConstraints = {
              video: booleanVideo && !!videoIdToStart ? { ...objVideo, deviceId: { exact: videoIdToStart } } : objVideo,
              audio: booleanAudio && !!audioIdToStart ? { ...objAudio, deviceId: { exact: audioIdToStart } } : objAudio,
            };

            console.log("-> Ponownie pobieram urządzenia")
            console.log({ exactConstraints })
            requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);
          }

          // console.log("-> Nadpisuję kolejne detailedSettings")
          // requestedDevices.getTracks().forEach((track) => {
          //   const settings = track.getSettings();
          //   if (settings.deviceId) {
          //     detailedSettings.push(settings);
          //     const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId)
          //     const kind = currentDevice?.kind || null
          //     if (currentDevice && kind && kind === "videoinput" || kind === "audioinput") {
          //       currentDevices[kind] = currentDevice || null
          //     }
          //   }
          // });
        }
      }
    } catch (error: unknown) {
      console.error("-> To sięn powinno wydarzyć")
    }

    const videoDevices = mediaDeviceInfos.filter(isVideo);
    const audioDevices = mediaDeviceInfos.filter(isAudio);

    const videoTrack = requestedDevices?.getVideoTracks()[0] || null;
    const audioTrack = requestedDevices?.getAudioTracks()[0] || null;

    setState({
      video: prepareReturn(
        booleanVideo,
        videoDevices,
        videoError,
      ),
      audio: prepareReturn(
        booleanAudio,
        audioDevices,
        audioError,
      ),
      audioMedia: {
        stream: requestedDevices,
        track: audioTrack,
        settings: getRequestedDeviceSettings(detailedSettings, audioDevices),
      },
      videoMedia: {
        stream: requestedDevices,
        track: videoTrack,
        settings: getRequestedDeviceSettings(detailedSettings, videoDevices),
      }
    });
    setMediaStream(requestedDevices)
    setMediaDeviceInfo(mediaDeviceInfos)
  }, [previousAudioDevice, previousVideoDevice])

  const startDevice = useCallback(async (type: "video" | "audio", deviceId: string, constraints: MediaTrackConstraints) => {
    const name = type === "audio" ? "audioMedia" : "videoMedia"
    // is it safe?
    state?.[name]?.track?.stop()

    const objConstraints = toMediaTrackConstraints(constraints);
    const exactConstraints: MediaStreamConstraints = {
      [type]: { ...objConstraints, deviceId: { exact: deviceId } }
    };

    console.log("-> Pobieram nowe urządzenie")
    console.log({ exactConstraints })
    const requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);

    setState((prevState) => {
      if (prevState === null) {
        return null;
      }
      // todo add settings
      const newMedia: { audioMedia: Media } | { videoMedia: Media } = type === "audio"
        ? {
          audioMedia: {
            stream: requestedDevices,
            track: requestedDevices.getAudioTracks()[0] || null,
            settings: null
          }
        }
        : {
          videoMedia: {
            stream: requestedDevices,
            track: requestedDevices.getVideoTracks()[0] || null,
            settings: null
          }
        }

      return ({ ...prevState, ...newMedia })
    })

  }, [state])

  const stopDevice = useCallback(async (type: "video" | "audio") => {
    const name = type === "audio" ? "audioMedia" : "videoMedia"

    setState((prevState) => {
      if (prevState === null) {
        return null;
      }
      prevState?.[name]?.track?.stop()

      return ({ ...prevState, [name]: null })
    })

  }, [])


  useEffect(() => {
    console.log({ state })
  }, [state])

  return (<div className="w-full-no-scrollbar">
    <button className="btn m-1 btn-success" onClick={() => {
      console.log("Starting...")
      start(VIDEO_TRACK_CONSTRAINTS, AUDIO_TRACK_CONSTRAINTS)
    }}>
      START
    </button>

    <div className="flex flex-col items-start m-1">
      <div>
        <button className="btn" onClick={() => {
          navigator.mediaDevices.enumerateDevices().then((devices) => {
            setMediaDeviceInfo(devices)
          })
        }}>
          enumerateDevices
        </button>
      </div>

      <div className="flex flex-row flex-wrap items-start">
        <div className="flex flex-col">
          <button className="btn m-1 btn-success" onClick={() => {
            navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
              setMediaStream(stream)
            })
          }}>
            getUserMedia({`{ video: true }`})
          </button>
          <button className="btn m-1 btn-success" onClick={() => {
            navigator.mediaDevices.getUserMedia({ video: { deviceId: videoId } }).then((stream) => {
              setMediaStream(stream)
            })
          }}>
            getUserMedia({`{ video: { deviceId: videoId } }`})
          </button>
          <button className="btn m-1 btn-success" onClick={() => {
            navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: videoId, }, }
            }).then((stream) => {
              setMediaStream(stream)
            })
          }}>
            getUserMedia({`{ video: { deviceId: { exact: videoId, }, } } }`})
          </button>
        </div>
        <input type="text" placeholder="DeviceId" className="input input-bordered w-full max-w-xs m-1"
               onChange={(e) => setVideoId(e.target.value || "")}
               value={videoId}/>
        <button className="btn m-1 btn-error" onClick={() => {
          mediaStream?.getTracks().forEach((track) => {
            track.stop()
          })
          setMediaStream(null)
        }}>
          Stop device
        </button>
      </div>

      {mediaStream && <div>
          <h3>Algorithm result</h3>
        {mediaStream.getTracks().map((track) => {
          const settings = track.getSettings()

          let prevVideoLabel: string | null = null
          let thisVideoLabel: string | null = null

          let prevAudioLabel: string | null = null
          let thisAudioLabel: string | null = null

          if (state?.video.type === "OK") {
            thisVideoLabel = state.video.devices.find((device) => device.deviceId === settings?.deviceId)?.label || null
            prevVideoLabel = state.video.devices.find((device) => device.deviceId === previousVideoDevice?.deviceId)?.label || null
          }

          if (state?.audio.type === "OK") {
            thisAudioLabel = state.audio.devices.find((device) => device.deviceId === settings?.deviceId)?.label || null
            prevAudioLabel = state.audio.devices.find((device) => device.deviceId === previousAudioDevice?.deviceId)?.label || null
          }

          const isAudio = !!thisAudioLabel

          return (
            <div key={settings.deviceId} className="flex flex-row items-start">
              <div className="badge badge-outline badge-success m-1">{thisVideoLabel || thisAudioLabel}</div>
              <div className="badge badge-outline badge-secondary m-1">{settings.deviceId}</div>

              {!isAudio && (prevVideoLabel === previousVideoDevice?.label || settings.deviceId === previousVideoDevice?.deviceId) &&
                  <div className="badge badge-success">Success!</div>
              }

              {isAudio && (prevAudioLabel === previousAudioDevice?.label || settings.deviceId === previousAudioDevice?.deviceId) &&
                  <div className="badge badge-success">Success!</div>
              }
            </div>
          )
        })}
      </div>}

      <div className="flex flex-row">
        {previousVideoDevice && <div className="card bg-base-100 shadow-xl m-1">
            <div className="card-body">
                <h3>Local Storage Video Device</h3>
                <div className="flex flex-col items-start">
                    <div className="badge badge-outline badge-success m-1">{previousVideoDevice.label}</div>

                    <div className="flex flex-row">
                        <input type="text"
                               placeholder="Audio device label"
                               className="input input-bordered w-full max-w-xs m-1"
                               onChange={(e) => setVideoDeviceLabelInput(e.target.value || "")}
                               value={videoDeviceLabelInput}/>
                        <button className="btn m-1 btn-success" onClick={() => {
                          const device: MediaDeviceInfo = {
                            ...loadObject("video", {} as MediaDeviceInfo),
                            label: videoDeviceLabelInput
                          }

                          saveObject("video", device)
                        }}>
                            Save to LS
                        </button>
                    </div>

                    <div className="badge badge-outline badge-secondary m-1">{previousVideoDevice.deviceId}</div>
                    <div className="flex flex-row">
                        <input type="text"
                               placeholder="Video device id"
                               className="input input-bordered w-full max-w-xs m-1"
                               onChange={(e) => setVideoDeviceIdInput(e.target.value || "")}
                               value={videoDeviceIdInput}/>
                        <button className="btn m-1 btn-success" onClick={() => {
                          const device: MediaDeviceInfo = {
                            ...loadObject("video", {} as MediaDeviceInfo),
                            deviceId: videoDeviceIdInput
                          }

                          saveObject("video", device)
                        }}>
                            Save to LS
                        </button>
                    </div>
                </div>
                <button className="btn m-1 btn-success" onClick={() => {
                  setPreviousVideoDevice(null)
                  saveObject("video", null)
                }}>
                    Remove LS
                </button>
            </div>
        </div>}

        {previousAudioDevice && <div className="card bg-base-100 shadow-xl m-1">
            <div className="card-body">
                <h3>Local Storage Audio Device</h3>
                <div className="flex flex-col items-start">
                    <div className="badge badge-outline badge-success m-1">{previousAudioDevice.label}</div>

                    <div className="flex flex-row">
                        <input type="text"
                               placeholder="Audio device label"
                               className="input input-bordered w-full max-w-xs m-1"
                               onChange={(e) => setAudioDeviceLabelInput(e.target.value || "")}
                               value={audioDeviceLabelInput}/>
                        <button className="btn m-1 btn-success" onClick={() => {
                          const device: MediaDeviceInfo = {
                            ...loadObject("audio", {} as MediaDeviceInfo),
                            label: audioDeviceLabelInput
                          }

                          saveObject("audio", device)
                        }}>
                            Save to LS
                        </button>
                    </div>

                    <div className="badge badge-outline badge-secondary m-1">{previousAudioDevice.deviceId}</div>
                    <div className="flex flex-row">
                        <input type="text"
                               placeholder="Audio device id"
                               className="input input-bordered w-full max-w-xs m-1"
                               onChange={(e) => setAudioDeviceIdInput(e.target.value || "")}
                               value={audioDeviceIdInput}/>
                        <button className="btn m-1 btn-success" onClick={() => {
                          const device: MediaDeviceInfo = {
                            ...loadObject("audio", {} as MediaDeviceInfo),
                            deviceId: audioDeviceIdInput
                          }

                          saveObject("audio", device)
                        }}>
                            Save to LS
                        </button>
                    </div>
                </div>
                <button className="btn m-1 btn-success" onClick={() => {
                  setPreviousAudioDevice(null)
                  saveObject("audio", null)
                }}>
                    Remove LS
                </button>
            </div>
        </div>}
      </div>

      {mediaDeviceInfo && <div>
          <h3>Current devices</h3>
        {mediaDeviceInfo.map((device, idx) => {
          return <div key={idx} className="flex flex-row flex-wrap items-start">
            <div className="badge badge-outline badge-primary m-1">{device.label}</div>
            <div className="badge badge-outline badge-secondary m-1">{device.deviceId}</div>
            <div className="badge badge-outline badge-info m-1">{device.groupId}</div>
          </div>
        })}
          <button className="btn m-1" onClick={() => {
            saveObject("devices", mediaDeviceInfo)
          }}>
              save to local storage
          </button>
      </div>}

      <div className="card bg-base-100 shadow-xl m-1">
        <div className="card-body">
          <div className="card-title">
            <h3>Local storage devices</h3>
          </div>
          {localStorageDevices.map((device, idx) => {
            return <div key={idx} className="flex flex-row flex-wrap items-start">
              <button className="btn m-1 btn-success" onClick={() => {
                if (device.kind === "videoinput") {
                  setPreviousVideoDevice(device)
                  saveObject("video", device)
                  setVideoDeviceLabelInput(device.label)
                  setVideoDeviceIdInput(device.deviceId)
                } else {
                  setPreviousAudioDevice(device)
                  saveObject("audio", device)
                  setAudioDeviceLabelInput(device.label)
                  setAudioDeviceIdInput(device.deviceId)
                }
              }}>
                Save to LS
              </button>
              <div
                className={"badge m-1 " + (device.kind === "videoinput" ? "badge-success" : "badge-primary")}>{device.label}</div>
              <div className="badge badge-secondary m-1">{device.deviceId}</div>
              <div className="badge badge-secondary badge-info m-1">{device.groupId}</div>
              <button className="btn m-1 btn-warning" onClick={() => {
                if (device.kind === "videoinput") {
                  startDevice("video", device.deviceId, VIDEO_TRACK_CONSTRAINTS)
                } else {
                  startDevice("audio", device.deviceId, AUDIO_TRACK_CONSTRAINTS)
                }
              }}>
                Run
              </button>
            </div>
          })}
        </div>
        <div className="flex flex-row items-start">

          <button className="btn m-1" onClick={() => {
            setLocalStorageDevices(loadObject<MediaDeviceInfo[]>("devices", []))
          }}>
            Relaod from local storage
          </button>
          <button className="btn m-1" onClick={() => {
            removeSavedItem("devices")
          }}>
            Clear
          </button>
        </div>
      </div>
    </div>
  </div>)
};

export default App;
