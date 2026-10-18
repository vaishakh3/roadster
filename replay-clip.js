// Captures only an explicitly requested replay; never records microphone/camera.
export function clipSupported() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}
export function createClip(source, title, onDone, onError) {
  if (!clipSupported())
    throw new Error(
      "Clip recording is unavailable in this browser. You can still save a run card.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare the clip canvas.");
  const stream = canvas.captureStream(30);
  const mime = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/mp4",
    "video/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
  let recorder;
  try {
    recorder = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 2500000,
    });
  } catch (e) {
    stopTracks();
    throw e;
  }
  let chunks = [],
    active = true,
    terminal = false,
    bytes = 0;
  const stopRecorder = () => {
    if (recorder.state !== "inactive") recorder.stop();
    else stopTracks();
  };
  const fail = (message) => {
    if (terminal) return;
    terminal = true;
    active = false;
    chunks = [];
    stopRecorder();
    stopTracks();
    onError(message);
  };
  recorder.ondataavailable = (e) => {
    if (terminal || !e.data.size) return;
    bytes += e.data.size;
    if (bytes >= 8000000) {
      fail("The clip exceeded the recording limit.");
      return;
    }
    chunks.push(e.data);
  };
  recorder.onerror = () => fail("Your browser could not record this clip.");
  recorder.onstop = () => {
    stopTracks();
    active = false;
    if (terminal) return;
    terminal = true;
    const saved = chunks;
    chunks = [];
    if (saved.length)
      onDone(
        new Blob(saved, { type: recorder.mimeType }),
        recorder.mimeType.includes("mp4") ? "mp4" : "webm",
      );
    else
      onError("The browser did not capture any frames. Try recording again.");
  };
  try {
    recorder.start(250);
  } catch (e) {
    terminal = true;
    active = false;
    stopTracks();
    throw e;
  }
  return {
    draw(time) {
      if (!active) return;
      try {
        if (!source.width || !source.height)
          throw new Error("Canvas has no renderable size");
        const scale = Math.max(960 / source.width, 540 / source.height),
          w = source.width * scale,
          h = source.height * scale;
        ctx.drawImage(source, (960 - w) / 2, (540 - h) / 2, w, h);
        const fade = ctx.createLinearGradient(0, 0, 0, 115);
        fade.addColorStop(0, "#031018dd");
        fade.addColorStop(1, "#03101800");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, 960, 115);
        ctx.fillStyle = "#f6f2e7";
        ctx.font = "600 24px Barlow";
        ctx.fillText("ROADSTER / " + title, 30, 40);
        ctx.fillStyle = "#a2fbe0";
        ctx.font = "14px Plex";
        ctx.fillText("FLIGHT DIVISION  /  " + time.toFixed(1) + " S", 30, 66);
      } catch {
        fail("The browser could not capture this replay. Try recording again.");
      }
    },
    stop() {
      if (!active) return;
      active = false;
      stopRecorder();
    },
    cancel() {
      if (terminal) return;
      terminal = true;
      chunks = [];
      active = false;
      stopRecorder();
      stopTracks();
    },
  };
}
