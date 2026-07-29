import test from "node:test";
import assert from "node:assert/strict";
import { commitWithRetry, OperationTimeoutError, withTimeout } from "../save-flow.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("withTimeout devolve o resultado quando a operação termina", async () => {
  const result = await withTimeout(Promise.resolve("salvo"), 50, "teste");
  assert.equal(result, "salvo");
});

test("withTimeout interrompe operações que ficam pendentes", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 15, "gravação no Firestore"),
    (error) => error instanceof OperationTimeoutError
      && error.code === "operation-timeout"
      && error.stage === "gravação no Firestore"
  );
});

test("commitWithRetry conclui na primeira tentativa", async () => {
  let attempts = 0;
  const result = await commitWithRetry(async () => {
    attempts += 1;
    return "confirmado";
  }, { timeoutMs: 50, retries: 1 });

  assert.equal(result, "confirmado");
  assert.equal(attempts, 1);
});

test("commitWithRetry repete uma gravação que excedeu o tempo", async () => {
  let attempts = 0;
  let retries = 0;
  const result = await commitWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) return new Promise(() => {});
    return "confirmado na segunda tentativa";
  }, {
    timeoutMs: 15,
    retries: 1,
    onRetry: () => { retries += 1; }
  });

  assert.equal(result, "confirmado na segunda tentativa");
  assert.equal(attempts, 2);
  assert.equal(retries, 1);
});



test("commitWithRetry repete indisponibilidade temporária do Firestore", async () => {
  let attempts = 0;
  const result = await commitWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw { code: "unavailable" };
    return "confirmado após indisponibilidade";
  }, { timeoutMs: 50, retries: 1 });

  assert.equal(result, "confirmado após indisponibilidade");
  assert.equal(attempts, 2);
});

test("commitWithRetry não repete erros de permissão", async () => {
  let attempts = 0;
  await assert.rejects(
    commitWithRetry(async () => {
      attempts += 1;
      throw { code: "permission-denied" };
    }, { timeoutMs: 50, retries: 1 }),
    (error) => error.code === "permission-denied"
  );
  assert.equal(attempts, 1);
});

test("uma promessa antiga pode terminar sem alterar o resultado da repetição", async () => {
  let attempts = 0;
  const result = await commitWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      await wait(40);
      return "primeira tentativa atrasada";
    }
    return "segunda tentativa confirmada";
  }, { timeoutMs: 10, retries: 1 });

  assert.equal(result, "segunda tentativa confirmada");
  assert.equal(attempts, 2);
});
