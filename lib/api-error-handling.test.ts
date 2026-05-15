import { describe, it, expect } from "vitest";

describe("Response body reading pattern", () => {
  it("res.text() then JSON.parse works for JSON responses", async () => {
    const body = JSON.stringify({ error: "Rate limit reached" });
    const res = new Response(body, {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });

    const text = await res.text();
    expect(text).toBe(body);

    const parsed = JSON.parse(text) as { error: string };
    expect(parsed.error).toBe("Rate limit reached");
  });

  it("res.text() then JSON.parse handles non-JSON gracefully", async () => {
    const res = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    const text = await res.text();
    let errMsg = `Request failed (500)`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      errMsg = parsed.error || errMsg;
    } catch {
      // Not JSON — use default
    }
    expect(errMsg).toBe("Request failed (500)");
  });

  it("res.text() then JSON.parse extracts error field", async () => {
    const res = new Response(JSON.stringify({ error: "Custom error message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

    const text = await res.text();
    let errMsg = `Request failed (400)`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      errMsg = parsed.error || errMsg;
    } catch {
      // Not JSON
    }
    expect(errMsg).toBe("Custom error message");
  });

  it("reading body twice with res.json() then res.text() fails", async () => {
    const res = new Response(JSON.stringify({ error: "test" }), {
      headers: { "Content-Type": "application/json" },
    });

    // First read succeeds
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("test");

    // Second read fails — this is the bug we fixed
    await expect(res.text()).rejects.toThrow();
  });

  it("safe pattern: res.text() only reads once", async () => {
    const res = new Response(JSON.stringify({ error: "test" }), {
      headers: { "Content-Type": "application/json" },
    });

    const text = await res.text();
    const parsed = JSON.parse(text) as { error: string };
    expect(parsed.error).toBe("test");

    // No second read needed — body consumed only once
  });
});