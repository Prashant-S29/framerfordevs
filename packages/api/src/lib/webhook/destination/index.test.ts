// Exercises webhook URL normalization and all-address SSRF rejection without network access.

import { assert, describe, it } from "@effect/vitest";

import { normalizeWebhookDestination, validateWebhookDnsAnswers } from "./index";

describe("webhook destination policy", () => {
  it("accepts canonical HTTPS hook URLs while retaining sensitive path/query only in the full URL", () => {
    const result = normalizeWebhookDestination(
      "https://HOOKS.Example.com/build/opaque?token=do-not-log",
    );
    assert.isTrue(result.ok);
    if (!result.ok) return;
    assert.strictEqual(result.value.hostname, "hooks.example.com");
    assert.strictEqual(result.value.displayOrigin, "https://hooks.example.com");
    assert.include(result.value.url, "/build/opaque?token=do-not-log");
  });

  it("rejects non-HTTPS, custom ports, userinfo, fragments, literal IPs, and internal names", () => {
    const cases = [
      ["http://hooks.example.com/build", "scheme"],
      ["https://hooks.example.com:8443/build", "port"],
      ["https://user:pass@hooks.example.com/build", "userinfo"],
      ["https://hooks.example.com/build#secret", "fragment"],
      ["https://127.0.0.1/build", "literal_ip"],
      ["https://service.internal/build", "blocked_hostname"],
      ["https://localhost/build", "hostname"],
    ] as const;
    for (const [url, category] of cases) {
      assert.deepStrictEqual(normalizeWebhookDestination(url), { ok: false, category });
    }
  });

  it("accepts only when every DNS answer is globally routable", () => {
    assert.deepStrictEqual(validateWebhookDnsAnswers(["93.184.216.34", "2606:2800:220:1::1"]), {
      ok: true,
      value: ["2606:2800:220:1:0:0:0:1", "93.184.216.34"],
    });
    for (const answer of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "192.0.2.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ]) {
      assert.deepStrictEqual(validateWebhookDnsAnswers(["93.184.216.34", answer]), {
        ok: false,
        category: "dns_non_public_answer",
      });
    }
  });

  it("rejects empty, malformed, and excessive answer sets", () => {
    assert.deepStrictEqual(validateWebhookDnsAnswers([]), { ok: false, category: "dns_empty" });
    assert.deepStrictEqual(validateWebhookDnsAnswers(["not-an-ip"]), {
      ok: false,
      category: "dns_invalid_answer",
    });
    assert.deepStrictEqual(validateWebhookDnsAnswers(Array.from({ length: 17 }, () => "8.8.8.8")), {
      ok: false,
      category: "dns_too_many_answers",
    });
  });
});
