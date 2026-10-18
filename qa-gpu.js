// Opt-in QA microbenchmark. These queries never run during ordinary gameplay.
export async function measureRenderGpu(renderer, scene, camera, count = 24) {
  if (document.hidden)
    return { supported: false, reason: "Keep the measurement tab visible." };
  const gl = renderer.getContext();
  const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!extension)
    return {
      supported: false,
      reason: "GPU timer queries unavailable on this browser/device.",
    };
  if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY))
    return { supported: false, reason: "Another GPU query is active." };
  const pending = [],
    gpu = [],
    cpu = [];
  const next = () =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        resolve();
      }, 250);
      const frame = requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  let disjoint = false;
  function collect() {
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) disjoint = true;
    for (let i = pending.length - 1; i >= 0; i--) {
      const query = pending[i];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
      gpu.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(query);
      pending.splice(i, 1);
    }
  }
  try {
    for (let i = 0; i < Math.max(4, Math.min(32, count)); i++) {
      await next();
      if (document.hidden)
        return {
          supported: false,
          reason: "Measurement cancelled when the tab became hidden.",
        };
      const query = gl.createQuery();
      pending.push(query);
      const started = performance.now();
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      try {
        renderer.render(scene, camera);
      } finally {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
      }
      cpu.push(performance.now() - started);
      collect();
    }
    const until = performance.now() + 2000;
    while (pending.length && performance.now() < until) {
      await next();
      collect();
    }
    const summarize = (values) => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p95: sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
        ],
      };
    };
    return {
      supported: true,
      valid: !disjoint && pending.length === 0,
      disjoint,
      samples: gpu.length,
      gpuMs: summarize(gpu),
      cpuSubmitMs: summarize(cpu),
      note: "Single rendered scene timing on this device; frozen simulation, not mobile gameplay FPS.",
    };
  } finally {
    for (const query of pending) gl.deleteQuery(query);
  }
}
