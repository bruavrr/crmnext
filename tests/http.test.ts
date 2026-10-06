import { it, expect } from "vitest";
import { rawBody, body } from "../src/lib/http";
it("preserva corpo JSON exato para assinatura e parse", async () => {
  const raw = '{"name":"Pessoa Á"}';
  expect(
    await rawBody(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      }),
    ),
  ).toBe(raw);
  expect(
    await body(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw,
      }),
    ),
  ).toEqual({ name: "Pessoa Á" });
});
it("interrompe corpo transmitido acima de 64 KB sem Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(40000));
      controller.enqueue(new Uint8Array(40000));
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await expect(rawBody(req)).rejects.toMatchObject({ status: 413 });
  expect(cancelled).toBe(true);
});
it("rejeita tipo de conteúdo incorreto", async () => {
  await expect(
    rawBody(
      new Request("http://localhost/api", { method: "POST", body: "text" }),
    ),
  ).rejects.toMatchObject({ status: 415 });
});
