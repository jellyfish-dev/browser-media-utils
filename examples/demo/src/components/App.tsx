import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadObject, loadString, removeSavedItem, saveObject } from "../localStorageUtils";
import { NewHook, useNewHook } from "./useNewHook";
import {
  getName,
  getRequestedDeviceSettings,
  isAudio,
  isNotGranted,
  isVideo,
  prepareReturn,
  toMediaTrackConstraints
} from "./utils";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "../constraints";

export const App = () => {
  const [localStorageDevices, setLocalStorageDevices] = useState(() => loadObject<MediaDeviceInfo[]>("devices", []))
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [mediaDeviceInfo, setMediaDeviceInfo] = useState<MediaDeviceInfo[] | null>(null)
  const [videoId, setVideoId] = useState<string>("")
  const [videoGroup, setVideoGroup] = useState<string>("")
  const [previousVideoDevice, setPreviousVideoDevice] = useState<MediaDeviceInfo | null>(() => loadObject("video", null))
  const [previousAudioDevice, setPreviousAudioDevice] = useState<MediaDeviceInfo | null>(() => loadObject("audio", null))
  const [lastSelectedAudioDevice, setLastSelectedAudioDevice] = useState<MediaDeviceInfo | null>(() => loadObject("audio", null))

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
    }));

    let audioError: string | null = null;
    let videoError: string | null = null;

    const detailedSettings: Array<MediaTrackSettings> = [];

    setState((prevState) => ({
      audio: booleanVideo && objVideo ? { type: "Requesting" } : prevState?.audio ?? { type: "Loading" },
      video: booleanAudio && objAudio ? { type: "Requesting" } : prevState?.video ?? { type: "Loading" },
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
          // todo obsluzyc brak takiego urządzenia
          // eg. Safari

          const videoIdToStart = mediaDeviceInfos.find((info) => info.label === previousVideoDevice?.label)?.deviceId
          const audioIdToStart = mediaDeviceInfos.find((info) => info.label === previousAudioDevice?.label)?.deviceId

          if (videoIdToStart || audioIdToStart) {
            console.log("-> Wyłączam wszystko")
            requestedDevices.getTracks().forEach((track) => {
              track.stop();
            });
            // todo
            //  obsluzyc sytuację gdzie jedno urządzenie zniknęło albo ma inną nazwę nie występującą obecnie

            const exactConstraints: MediaStreamConstraints = {
              video: booleanVideo && !!videoIdToStart && { ...objVideo, deviceId: { exact: videoIdToStart } },
              audio: booleanAudio && !!audioIdToStart && { ...objAudio, deviceId: { exact: audioIdToStart } },
            };

            requestedDevices = await navigator.mediaDevices.getUserMedia(exactConstraints);
          }

          console.log("-> Nadpisuję kolejne detailedSettings")
          requestedDevices.getTracks().forEach((track) => {
            const settings = track.getSettings();
            if (settings.deviceId) {
              detailedSettings.push(settings);
              const currentDevice = mediaDeviceInfos.find((device) => device.deviceId == settings.deviceId)
              const kind = currentDevice?.kind || null
              if (currentDevice && kind && kind === "videoinput" || kind === "audioinput") {
                currentDevices[kind] = currentDevice || null
              }
            }
          });
        }
      }
    } catch (error: unknown) {
      console.error("-> To sięn powinno wydarzyć")
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
    setMediaStream(requestedDevices)
    setMediaDeviceInfo(mediaDeviceInfos)
  }, [previousAudioDevice, previousVideoDevice])

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
        {/*<input type="text" placeholder="GroupId" className="input input-bordered w-full max-w-xs m-1"*/}
        {/*       onChange={(e) => setVideoGroup(e.target.value || "")}*/}
        {/*       value={videoGroup}/>*/}
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
          let label: string | null = null
          let thisLabel: string | null = null
          if (state?.video.type === "OK") {
            thisLabel = state.video.devices.find((device) => device.deviceId === settings?.deviceId)?.label || null
            label = state.video.devices.find((device) => device.deviceId === previousVideoDevice?.deviceId)?.label || null
          }

          console.log({
            thisLabel, label
          })
          return (
            <div key={settings.deviceId} className="flex flex-row items-start">
              <div className="badge badge-outline badge-success m-1">{thisLabel}</div>
              <div className="badge badge-outline badge-secondary m-1">{settings.deviceId}</div>
              {(label === previousVideoDevice?.label || settings.deviceId === previousVideoDevice?.deviceId) &&
                  <div className="badge badge-success">Success!</div>}
            </div>
          )
        })}
      </div>}

      <div>
        {previousVideoDevice && <div className="card">
            <h3>Local Storage Video Device</h3>
            <div className="flex flex-row items-start">
                <div className="badge badge-outline badge-success m-1">{previousVideoDevice.label}</div>
                <div className="badge badge-outline badge-secondary m-1">{previousVideoDevice.deviceId}</div>
            </div>
            <button className="btn m-1 btn-success" onClick={() => {
              setPreviousVideoDevice(null)
              saveObject("video", null)
            }}>
                Remove LS
            </button>
        </div>}
      </div>

      {mediaDeviceInfo && <div>
          <h3>Current devices</h3>
        {mediaDeviceInfo.map((device, idx) => {
          return <div key={idx} className="flex flex-row flex-wrap items-start">

            {/*<button className="btn m-1 btn-warning" onClick={() => {*/}
            {/*  setLocalStorageVideoDevice(device)*/}
            {/*}}>*/}
            {/*  Save to LS*/}
            {/*</button>*/}
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

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <div className="card-title">
            <h3>Local storage devices</h3>
          </div>
          {localStorageDevices.map((device, idx) => {
            return <div key={idx} className="flex flex-row flex-wrap items-start">
              <button className="btn m-1 btn-success" onClick={() => {
                setPreviousVideoDevice(device)
                saveObject("video", device)
              }}>
                Save to LS
              </button>
              <div
                className={"badge m-1 " + (device.kind === "videoinput" ? "badge-success" : "badge-primary")}>{device.label}</div>
              <div className="badge badge-secondary m-1">{device.deviceId}</div>
              <div className="badge badge-secondary badge-info m-1">{device.groupId}</div>
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
