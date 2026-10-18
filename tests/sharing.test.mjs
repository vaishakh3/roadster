import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { COURSES, LAYOUT_VERSION } from "../courses.js";
import { encodeChallenge, decodeChallenge } from "../challenges.js";
import { createClip, clipSupported } from "../replay-clip.js";
let count = 0;
const test = async (name, fn) => {
  await fn();
  console.log("PASS " + name);
  count++;
};
await test("Challenge finish quantization retains the final pose without duplicate times", () => {
  for (const course of COURSES)
    for (let millis = 0; millis < 100; millis++) {
      const time = 80 + millis / 1000;
      const samples = [
        [0, 0, 0, 0],
        [10, 500, 0, 0],
        [time - 0.001, course.length - 0.3, 1, 0],
        [time, course.length, 1, 0],
      ];
      const result = decodeChallenge(
        encodeChallenge({ courseId: course.id, samples, time, score: 1000 }),
      );
      assert.equal(result.samples.at(-1)[1], course.length);
      assert(
        result.samples.every((p, i) => !i || p[0] > result.samples[i - 1][0]),
      );
      assert(Math.abs(result.time - time) <= 0.01001);
    }
});
await test("Challenge rejects negative time, malformed payloads and incompatible layouts", () => {
  const course = COURSES[0],
    samples = [
      [0, 0, 0, 0],
      [80, course.length, 0, 0],
    ];
  assert.throws(() =>
    encodeChallenge({
      courseId: course.id,
      samples: [[-0.5, 0, 0, 0], samples[1]],
      time: 80,
    }),
  );
  const code = encodeChallenge({ courseId: course.id, samples, time: 80 });
  assert.throws(() => decodeChallenge(code.slice(0, -1)));
  assert.throws(() => decodeChallenge("x".repeat(6001)));
  const bytes = Uint8Array.from(
    atob(code.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  bytes[3] = (LAYOUT_VERSION + 1) % 256;
  assert.throws(() =>
    decodeChallenge(
      btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
    ),
  );
});
const saved = {
  MediaRecorder: globalThis.MediaRecorder,
  HTMLCanvasElement: globalThis.HTMLCanvasElement,
  document: globalThis.document,
};
let failStart = false,
  failDraw = false,
  stopped = 0;
class MockRecorder {
  static isTypeSupported() {
    return true;
  }
  static latest;
  constructor(stream, options) {
    this.stream = stream;
    this.mimeType = options.mimeType;
    this.state = "inactive";
    MockRecorder.latest = this;
  }
  start() {
    if (failStart) throw new Error("Recorder unavailable");
    this.state = "recording";
  }
  stop() {
    assert.notEqual(this.state, "inactive");
    this.state = "inactive";
    queueMicrotask(() => this.onstop?.());
  }
}
globalThis.MediaRecorder = MockRecorder;
globalThis.HTMLCanvasElement = class {};
globalThis.HTMLCanvasElement.prototype.captureStream = () => {};
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          drawImage() {
            if (failDraw) throw new Error("Lost source");
          },
          createLinearGradient() {
            return { addColorStop() {} };
          },
          fillRect() {},
          fillText() {},
        };
      },
      captureStream() {
        return {
          getTracks: () => [
            {
              stop() {
                stopped++;
              },
            },
          ],
        };
      },
    };
  },
};
try {
  assert(clipSupported());
  await test("Clip stop emits one valid file and releases stream tracks", async () => {
    const done = [],
      errors = [];
    const clip = createClip(
      { width: 1280, height: 720 },
      "Test",
      (b) => done.push(b),
      (e) => errors.push(e),
    );
    clip.draw(1);
    MockRecorder.latest.ondataavailable({ data: new Blob(["frames"]) });
    clip.stop();
    await Promise.resolve();
    assert.equal(done.length, 1);
    assert.equal(errors.length, 0);
    assert(stopped > 0);
  });
  await test("Cancelling a clip prevents late data from producing a download", async () => {
    const done = [],
      errors = [];
    const clip = createClip(
      { width: 1280, height: 720 },
      "Test",
      (b) => done.push(b),
      (e) => errors.push(e),
    );
    MockRecorder.latest.ondataavailable({ data: new Blob(["frames"]) });
    clip.cancel();
    MockRecorder.latest.ondataavailable({ data: new Blob(["late"]) });
    await Promise.resolve();
    assert.equal(done.length, 0);
    assert.equal(errors.length, 0);
  });
  await test("Size limit on final inactive-recorder data reports failure without double stopping", async () => {
    const done = [],
      errors = [];
    const clip = createClip(
      { width: 1280, height: 720 },
      "Test",
      (b) => done.push(b),
      (e) => errors.push(e),
    );
    MockRecorder.latest.ondataavailable({ data: new Blob(["frames"]) });
    clip.stop();
    assert.equal(MockRecorder.latest.state, "inactive");
    MockRecorder.latest.ondataavailable({ data: { size: 8000000 } });
    await Promise.resolve();
    assert.equal(done.length, 0);
    assert.equal(errors.length, 1);
  });
  await test("Recorder errors discard late chunks and cannot become successful clips", async () => {
    const done = [],
      errors = [];
    createClip(
      { width: 1280, height: 720 },
      "Test",
      (b) => done.push(b),
      (e) => errors.push(e),
    );
    MockRecorder.latest.onerror();
    MockRecorder.latest.ondataavailable({ data: new Blob(["late"]) });
    await Promise.resolve();
    assert.equal(done.length, 0);
    assert.equal(errors.length, 1);
  });
  await test("Recorder startup failure and canvas loss release capture tracks", async () => {
    let prior = stopped;
    failStart = true;
    assert.throws(() =>
      createClip(
        { width: 1280, height: 720 },
        "Test",
        () => {},
        () => {},
      ),
    );
    assert(stopped > prior);
    failStart = false;
    const errors = [];
    prior = stopped;
    failDraw = true;
    const clip = createClip(
      { width: 1280, height: 720 },
      "Test",
      () => assert.fail("No file on failed canvas"),
      (e) => errors.push(e),
    );
    clip.draw(0);
    await Promise.resolve();
    assert.equal(errors.length, 1);
    assert(stopped > prior);
    failDraw = false;
  });
  await test("Graphics error cancels recording and releases tracks without losing the retry path", async () => {
    const source = fs.readFileSync(
        new URL("../main.js", import.meta.url),
        "utf8",
      ),
      showErrorSource = source.slice(
        source.indexOf("function showError("),
        source.indexOf("function announce("),
      ),
      cancelSource = source.slice(
        source.indexOf("function cancelClip("),
        source.indexOf("function stopFilm("),
      );
    const elements = new Map(),
      get = (id) => {
        if (!elements.has(id)) elements.set(id, {});
        return elements.get(id);
      };
    const before = stopped,
      result = { phase: "replay" },
      callbacks = [];
    const recording = createClip(
      { width: 1280, height: 720 },
      "Test",
      () => callbacks.push("saved"),
      () => callbacks.push("error"),
    );
    const context = {
      clip: recording,
      film: { recording: true },
      clipSupported,
      $: get,
      loading: {
        cancel() {
          get("loading").hidden = true;
          result.loadingCancelled = true;
        },
      },
      setPhase(value) {
        result.phase = value;
      },
    };
    vm.createContext(context);
    vm.runInContext(cancelSource + "\n" + showErrorSource, context);
    vm.runInContext('showError("Graphics connection lost")', context);
    await Promise.resolve();
    assert.equal(context.clip, null);
    assert.equal(context.film.recording, false);
    assert.equal(MockRecorder.latest.state, "inactive");
    assert(stopped > before);
    assert.equal(result.phase, "error");
    assert.equal(result.loadingCancelled, true);
    assert.equal(get("loading").hidden, true);
    assert.equal(get("error").hidden, false);
    assert.equal(get("save-clip").disabled, false);
    assert.deepEqual(callbacks, []);
  });
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}
console.log(`${count} sharing/recording checks passed.`);
