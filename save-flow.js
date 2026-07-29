export class OperationTimeoutError extends Error {
  constructor(stage, timeoutMs) {
    super(`A etapa "${stage}" excedeu ${timeoutMs} ms.`);
    this.name = "OperationTimeoutError";
    this.code = "operation-timeout";
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

export function withTimeout(task, timeoutMs, stage = "operação") {
  const promise = typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new OperationTimeoutError(stage, timeoutMs)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function commitWithRetry(commitFactory, options = {}) {
  if (typeof commitFactory !== "function") {
    throw new TypeError("commitFactory deve ser uma função.");
  }

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 20000;
  const retries = Number.isInteger(options.retries) && options.retries >= 0 ? options.retries : 1;
  const onAttempt = typeof options.onAttempt === "function" ? options.onAttempt : () => {};
  const onRetry = typeof options.onRetry === "function" ? options.onRetry : () => {};

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    onAttempt(attempt + 1, retries + 1);
    try {
      return await withTimeout(() => commitFactory(attempt), timeoutMs, "gravação no Firestore");
    } catch (error) {
      lastError = error;
      const retryableCodes = new Set(["operation-timeout", "unavailable", "deadline-exceeded", "aborted"]);
      const mayRetry = retryableCodes.has(error?.code) && attempt < retries;
      if (!mayRetry) throw error;
      onRetry(error, attempt + 1, retries + 1);
    }
  }

  throw lastError || new Error("Não foi possível concluir a gravação.");
}
