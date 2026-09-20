import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSnapshot, RadiantDesktopApi } from "../src/contracts.js";

const api: RadiantDesktopApi = {
  getSnapshot: () => ipcRenderer.invoke("radiant:get-snapshot"),
  subscribe(listener) {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: DesktopSnapshot) => listener(snapshot);
    ipcRenderer.on("radiant:snapshot", handler);
    return () => ipcRenderer.removeListener("radiant:snapshot", handler);
  },
  openLogin: () => ipcRenderer.invoke("radiant:open-login"),
  refreshAccount: () => ipcRenderer.invoke("radiant:refresh-account"),
  chooseReplay: () => ipcRenderer.invoke("radiant:choose-replay"),
  analyzeReplay: id => ipcRenderer.invoke("radiant:analyze-replay", id),
  analyzeClip: id => ipcRenderer.invoke("radiant:analyze-clip", id),
  openClipFolder: () => ipcRenderer.invoke("radiant:open-clip-folder"),
  retryRecorder: () => ipcRenderer.invoke("radiant:retry-recorder"),
};

contextBridge.exposeInMainWorld("radiant", api);
