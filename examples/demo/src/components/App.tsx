import React, { useEffect, useMemo, useState } from "react";
import { loadObject, removeSavedItem, saveObject } from "../localStorageUtils";
import { DeviceReturnType, useNewHook } from "./useNewHook";
import { isGranted } from "./utils";
import { AUDIO_TRACK_CONSTRAINTS, VIDEO_TRACK_CONSTRAINTS } from "../constraints";
import VideoPlayer from "./VideoPlayer";

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

export const App = () => {
  const [localStorageDevices, setLocalStorageDevices] = useState(() => loadObject<MediaDeviceInfo[]>("devices", []));
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaDeviceInfo, setMediaDeviceInfo] = useState<MediaDeviceInfo[] | null>(null);
  const [videoId, setVideoId] = useState<string>("");

  const [previousVideoDevice, setPreviousVideoDevice] = useState<MediaDeviceInfo | null>(() =>
    loadObject("video", null)
  );
  const [previousAudioDevice, setPreviousAudioDevice] = useState<MediaDeviceInfo | null>(() =>
    loadObject("audio", null)
  );

  const [audioDeviceLabelInput, setAudioDeviceLabelInput] = useState<string>("");
  const [audioDeviceIdInput, setAudioDeviceIdInput] = useState<string>("");

  const [videoDeviceLabelInput, setVideoDeviceLabelInput] = useState<string>("");
  const [videoDeviceIdInput, setVideoDeviceIdInput] = useState<string>("");

  useEffect(() => {
    const audio = loadObject<MediaDeviceInfo | null>("audio", null);
    if (audio) {
      setAudioDeviceIdInput(audio.deviceId);
      setAudioDeviceLabelInput(audio.label);
    }

    const video = loadObject<MediaDeviceInfo | null>("video", null);
    if (video) {
      setVideoDeviceIdInput(video.deviceId);
      setVideoDeviceLabelInput(video.label);
    }
  }, []);

  const { data, stop, start, init } = useNewHook(useMemo(() => ({
    getPreviousAudioDevice: () => loadObject("audio", null),
    getPreviousVideoDevice: () => loadObject("video", null)
  }), []))

  return (
    <div className="w-full-no-scrollbar">
      <div className="flex flex-col items-start m-1">
        <div className="flex flex-row items-start">
          <button
            className="btn btn-success m-1"
            onClick={() => {
              console.log("Starting...");
              init(VIDEO_TRACK_CONSTRAINTS, AUDIO_TRACK_CONSTRAINTS);
            }}
          >
            START
          </button>

          <button
            className="btn"
            onClick={() => {
              navigator.mediaDevices.enumerateDevices().then((devices) => {
                setMediaDeviceInfo(devices);
              });
            }}
          >
            enumerateDevices
          </button>

          <button
            className="btn m-1 btn-success"
            onClick={() => {
              navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
                setMediaStream(stream);
              });
            }}
          >
            getUserMedia({`{ video: true }`})
          </button>

          <button
            className="btn m-1 btn-success"
            onClick={() => {
              navigator.mediaDevices.getUserMedia({ video: { deviceId: videoId } }).then((stream) => {
                setMediaStream(stream);
              });
            }}
          >
            getUserMedia({`{ video: { deviceId: videoId } }`})
          </button>

          <button
            className="btn m-1 btn-success"
            onClick={() => {
              navigator.mediaDevices
                .getUserMedia({
                  video: { deviceId: { exact: videoId } },
                })
                .then((stream) => {
                  setMediaStream(stream);
                });
            }}
          >
            getUserMedia({`{ video: { deviceId: { exact: videoId, }, } } }`})
          </button>

        </div>
        <div className="flex flex-row flex-wrap items-start">
          <button
            className="btn m-1 btn-error"
            onClick={() => {
              stop("video")
            }}
          >
            Stop video
          </button>

          <button
            className="btn m-1 btn-error"
            onClick={() => {
              stop("audio")
            }}
          >
            Stop audio
          </button>

          <input
            type="text"
            placeholder="DeviceId"
            className="input input-bordered w-full max-w-xs m-1"
            onChange={(e) => setVideoId(e.target.value || "")}
            value={videoId}
          />
        </div>

        {data?.videoMedia?.stream &&
            <div className="w-[300px]"><VideoPlayer stream={data?.videoMedia?.stream}/></div>}

        {mediaStream && (
          <div>
            <h3>Algorithm result</h3>
            {mediaStream.getTracks().map((track) => {
              const settings = track.getSettings();

              let prevVideoLabel: string | null = null;
              let thisVideoLabel: string | null = null;

              let prevAudioLabel: string | null = null;
              let thisAudioLabel: string | null = null;

              if (data?.video.type === "OK") {
                thisVideoLabel =
                  data.video.devices.find((device) => device.deviceId === settings?.deviceId)?.label || null;
                prevVideoLabel =
                  data.video.devices.find((device) => device.deviceId === previousVideoDevice?.deviceId)?.label ||
                  null;
              }

              if (data?.audio.type === "OK") {
                thisAudioLabel =
                  data.audio.devices.find((device) => device.deviceId === settings?.deviceId)?.label || null;
                prevAudioLabel =
                  data.audio.devices.find((device) => device.deviceId === previousAudioDevice?.deviceId)?.label ||
                  null;
              }

              const isAudio = !!thisAudioLabel;

              return (
                <div key={settings.deviceId} className="flex flex-row items-start">
                  <div className="badge badge-outline badge-success m-1">{thisVideoLabel || thisAudioLabel}</div>
                  <div className="badge badge-outline badge-secondary m-1">{settings.deviceId}</div>

                  {!isAudio &&
                    (prevVideoLabel === previousVideoDevice?.label ||
                      settings.deviceId === previousVideoDevice?.deviceId) && (
                      <div className="badge badge-success">Success!</div>
                    )}

                  {isAudio &&
                    (prevAudioLabel === previousAudioDevice?.label ||
                      settings.deviceId === previousAudioDevice?.deviceId) && (
                      <div className="badge badge-success">Success!</div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-row">
          {previousVideoDevice && (
            <div className="card bg-base-100 shadow-xl m-1">
              <div className="card-body">
                <h3>Local Storage Video Device</h3>
                <div className="flex flex-col items-start">
                  <div className="badge badge-outline badge-success m-1">{previousVideoDevice.label}</div>

                  <div className="flex flex-row">
                    <input
                      type="text"
                      placeholder="Audio device label"
                      className="input input-bordered w-full max-w-xs m-1"
                      onChange={(e) => setVideoDeviceLabelInput(e.target.value || "")}
                      value={videoDeviceLabelInput}
                    />
                    <button
                      className="btn m-1 btn-success"
                      onClick={() => {
                        const device: MediaDeviceInfo = {
                          ...loadObject("video", {} as MediaDeviceInfo),
                          label: videoDeviceLabelInput,
                        };

                        saveObject("video", device);
                      }}
                    >
                      Save to LS
                    </button>
                  </div>

                  <div className="badge badge-outline badge-secondary m-1">{previousVideoDevice.deviceId}</div>
                  <div className="flex flex-row">
                    <input
                      type="text"
                      placeholder="Video device id"
                      className="input input-bordered w-full max-w-xs m-1"
                      onChange={(e) => setVideoDeviceIdInput(e.target.value || "")}
                      value={videoDeviceIdInput}
                    />
                    <button
                      className="btn m-1 btn-success"
                      onClick={() => {
                        const device: MediaDeviceInfo = {
                          ...loadObject("video", {} as MediaDeviceInfo),
                          deviceId: videoDeviceIdInput,
                        };

                        saveObject("video", device);
                      }}
                    >
                      Save to LS
                    </button>
                  </div>
                </div>
                <button
                  className="btn m-1 btn-success"
                  onClick={() => {
                    setPreviousVideoDevice(null);
                    saveObject("video", null);
                  }}
                >
                  Remove LS
                </button>
              </div>
            </div>
          )}

          {previousAudioDevice && (
            <div className="card bg-base-100 shadow-xl m-1">
              <div className="card-body">
                <h3>Local Storage Audio Device</h3>
                <div className="flex flex-col items-start">
                  <div className="badge badge-outline badge-success m-1">{previousAudioDevice.label}</div>

                  <div className="flex flex-row">
                    <input
                      type="text"
                      placeholder="Audio device label"
                      className="input input-bordered w-full max-w-xs m-1"
                      onChange={(e) => setAudioDeviceLabelInput(e.target.value || "")}
                      value={audioDeviceLabelInput}
                    />
                    <button
                      className="btn m-1 btn-success"
                      onClick={() => {
                        const device: MediaDeviceInfo = {
                          ...loadObject("audio", {} as MediaDeviceInfo),
                          label: audioDeviceLabelInput,
                        };

                        saveObject("audio", device);
                      }}
                    >
                      Save to LS
                    </button>
                  </div>

                  <div className="badge badge-outline badge-secondary m-1">{previousAudioDevice.deviceId}</div>
                  <div className="flex flex-row">
                    <input
                      type="text"
                      placeholder="Audio device id"
                      className="input input-bordered w-full max-w-xs m-1"
                      onChange={(e) => setAudioDeviceIdInput(e.target.value || "")}
                      value={audioDeviceIdInput}
                    />
                    <button
                      className="btn m-1 btn-success"
                      onClick={() => {
                        const device: MediaDeviceInfo = {
                          ...loadObject("audio", {} as MediaDeviceInfo),
                          deviceId: audioDeviceIdInput,
                        };

                        saveObject("audio", device);
                      }}
                    >
                      Save to LS
                    </button>
                  </div>
                </div>
                <button
                  className="btn m-1 btn-success"
                  onClick={() => {
                    setPreviousAudioDevice(null);
                    saveObject("audio", null);
                  }}
                >
                  Remove LS
                </button>
              </div>
            </div>
          )}
        </div>

        {mediaDeviceInfo && (
          <div>
            <h3>Current devices</h3>
            {mediaDeviceInfo.map((device, idx) => {
              return (
                <div key={idx} className="flex flex-row flex-wrap items-start">
                  <div className="badge badge-outline badge-primary m-1">{device.label}</div>
                  <div className="badge badge-outline badge-secondary m-1">{device.deviceId}</div>
                  {/*<div className="badge badge-outline badge-info m-1">{device.groupId}</div>*/}
                </div>
              );
            })}
            <button
              className="btn m-1"
              onClick={() => {
                saveObject("devices", mediaDeviceInfo);
              }}
            >
              save to local storage
            </button>
          </div>
        )}

        <div className="card bg-base-100 shadow-xl m-1">
          <div className="card-body">
            <div className="card-title">
              <h3>Local storage devices</h3>
            </div>
            {localStorageDevices.map((device, idx) => {
              return (
                <div key={idx} className="flex flex-row flex-wrap items-start">
                  <button
                    className="btn m-1 btn-success"
                    onClick={() => {
                      if (device.kind === "videoinput") {
                        setPreviousVideoDevice(device);
                        saveObject("video", device);
                        setVideoDeviceLabelInput(device.label);
                        setVideoDeviceIdInput(device.deviceId);
                      } else {
                        setPreviousAudioDevice(device);
                        saveObject("audio", device);
                        setAudioDeviceLabelInput(device.label);
                        setAudioDeviceIdInput(device.deviceId);
                      }
                    }}
                  >
                    Save to LS
                  </button>
                  <div className={"badge m-1 " + (device.kind === "videoinput" ? "badge-success" : "badge-primary")}>
                    {device.label}
                  </div>
                  <div className="badge badge-secondary m-1">{device.deviceId}</div>
                  {/*<div className="badge badge-secondary badge-info m-1">{device.groupId}</div>*/}
                  <button
                    className="btn m-1 btn-warning"
                    onClick={() => {
                      if (device.kind === "videoinput") {
                        start("video", device.deviceId, VIDEO_TRACK_CONSTRAINTS);
                      } else {
                        start("audio", device.deviceId, AUDIO_TRACK_CONSTRAINTS);
                      }
                    }}
                  >
                    Run
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-row items-start">
            <button
              className="btn m-1"
              onClick={() => {
                setLocalStorageDevices(loadObject<MediaDeviceInfo[]>("devices", []));
              }}
            >
              Relaod from local storage
            </button>
            <button
              className="btn m-1"
              onClick={() => {
                removeSavedItem("devices");
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
