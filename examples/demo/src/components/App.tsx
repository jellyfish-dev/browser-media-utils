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
  const [localStorageVideoDevice, setLocalStorageVideoDevice] = useState<MediaDeviceInfo | null>(() => loadObject("video", null))
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

    // const videoNotGranted = mediaDeviceInfos.filter(isVideo).some(isNotGranted);
    // const audioNotGranted = mediaDeviceInfos.filter(isAudio).some(isNotGranted);

    const constraints = {
      video: booleanVideo && objVideo,
      audio: booleanAudio && objAudio,
    };

    let audioError: string | null = null;
    let videoError: string | null = null;

    const detailedSettings: Array<MediaTrackSettings> = [];

    setState((prevState) => ({
      audio: constraints.audio ? { type: "Requesting" } : prevState?.audio ?? { type: "Loading" },
      video: constraints.video ? { type: "Requesting" } : prevState?.video ?? { type: "Loading" },
    }));

    let requestedDevices: MediaStream | null = null
    if (localStorageVideoDevice?.deviceId) {
      console.log("-> Jest device w local storage. Proszę o konkretne urządzenie")
      try {
        // if (constraints.audio || constraints.video) {


        // ask for every device
        // const requestedDevices = await navigator.mediaDevices.getUserMedia(constraints);

        const constraints2: MediaStreamConstraints = {
          video: booleanVideo && { ...objVideo, deviceId: { exact: localStorageVideoDevice?.deviceId } },
          audio: booleanAudio && objAudio,
        };

        console.log({ constraints2 })
        // ask for devices by ID
        requestedDevices = await navigator.mediaDevices.getUserMedia(constraints2);
        // }
      } catch (error: unknown) {
        console.warn("Nie ma tego urządzenia (stare id lub macos)")
        // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
        // const errorName = getName(error);
        // videoError = booleanVideo ? errorName : null;
        // audioError = booleanAudio ? errorName : null;
      }
    }

    try {
      if (requestedDevices === null) {
        console.log("-> Pytam o dowolne")
        // pytaj o jakiekolwiek
        const constraints3: MediaStreamConstraints = {
          video: booleanVideo && objVideo,
          audio: booleanAudio && objAudio,
        };
        console.log({ constraints3 })

        requestedDevices = await navigator.mediaDevices.getUserMedia(constraints3);
        console.log("Pobrało jakieś urządzenie")


        // jeżeli to nie to co chciałem (macos) to zmień

        // requestedDevices.getTracks().map((track) => {
        //   return track.getSettings().deviceId;
        // });
      }
    } catch (error: unknown) {
      console.warn("Błąd pobierania.")
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#exceptions
      // const errorName = getName(error);
      // videoError = booleanVideo ? errorName : null;
      // audioError = booleanAudio ? errorName : null;
    }

    const mediaDeviceInfos: MediaDeviceInfo[] = await navigator.mediaDevices.enumerateDevices();

    console.log({ enumeratedDevices: mediaDeviceInfos })

    const currentDevices: { videoinput: MediaDeviceInfo | null, audioinput: MediaDeviceInfo | null } = {
      videoinput: null,
      audioinput: null,
    }

    if (requestedDevices) {
      // // nie ma takiego urządzenia
      // mediaDeviceInfos = await navigator.mediaDevices.enumerateDevices();
      //
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
        // track.stop();
      });
    }

    if (localStorageVideoDevice && (currentDevices.videoinput?.deviceId !== localStorageVideoDevice.deviceId) || (currentDevices.videoinput?.label === localStorageVideoDevice?.label)) {
      console.log("Coś się nie zgadza!")
      console.log({
        id: {
          localStorage: localStorageVideoDevice?.deviceId,
          current: currentDevices.videoinput?.deviceId
        },
        label: {
          localStorage: localStorageVideoDevice?.label,
          current: currentDevices.videoinput?.label
        }
      })

      if (requestedDevices) {
        console.log("Wyłączam wszystko")

        requestedDevices.getTracks().forEach((track) => {
          track.stop();
        });

        console.log({ _name: "Szukany label", mediaDeviceInfos, labelToFind: localStorageVideoDevice?.label })

        const videoIdToStart = mediaDeviceInfos.find((info) => info.label === localStorageVideoDevice?.label)?.deviceId

        console.log({ name: "Ustalam id video do wystartowania", videoIdToStart })
        if (videoIdToStart) {
          const constraints4: MediaStreamConstraints = {
            video: booleanVideo && { ...objVideo, deviceId: { exact: videoIdToStart } },
            audio: booleanAudio && objAudio,
          };
          console.log({ constraints4 })

          requestedDevices = await navigator.mediaDevices.getUserMedia(constraints4);
        }


        console.log({ name: "Zapisuje kolejne detailedSettings" })
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
          // track.stop();
        });


        // ask for devices by ID
      }
    }

    console.log({ _name: "Obecne detailed currentDevices", currentDevices })

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
  }, [localStorageVideoDevice])

  useEffect(() => {
    console.log({ state })
  }, [state])

  useEffect(() => {
    if (state?.video.type === "OK") {
      const deviceId = state?.video.selectedDeviceSettings?.deviceId
      const stream = state.video.devices.find((device) => device.deviceId === deviceId)
      if (stream) {
        // setMediaStream(stream)
      }
    }
  }, [state])


  useEffect(() => {
    console.log({ videoId })
  }, [videoId])

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
            label = state.video.devices.find((device) => device.deviceId === localStorageVideoDevice?.deviceId)?.label || null
          }

          console.log({
            thisLabel, label
          })
          return (
            <div key={settings.deviceId} className="flex flex-row items-start">
              <div className="badge badge-outline badge-success m-1">{thisLabel}</div>
              <div className="badge badge-outline badge-secondary m-1">{settings.deviceId}</div>
              {(label === localStorageVideoDevice?.label || settings.deviceId === localStorageVideoDevice?.deviceId) &&
                  <div className="badge badge-success">Success!</div>}
            </div>
          )
        })}
      </div>}

      <div>
        {localStorageVideoDevice && <div className="card">
            <h3>Local Storage Video Device</h3>
            <div className="flex flex-row items-start">
                <div className="badge badge-outline badge-success m-1">{localStorageVideoDevice.label}</div>
                <div className="badge badge-outline badge-secondary m-1">{localStorageVideoDevice.deviceId}</div>
            </div>
            <button className="btn m-1 btn-success" onClick={() => {
              setLocalStorageVideoDevice(null)
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
                setLocalStorageVideoDevice(device)
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
