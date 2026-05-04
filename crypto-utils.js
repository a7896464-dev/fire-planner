(function () {
  const TEXT_ENCODER = new TextEncoder();
  const TEXT_DECODER = new TextDecoder();

  function toBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function fromBase64Url(value) {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function getSubtle() {
    if (!window.crypto?.subtle) {
      throw new Error("이 브라우저에서는 암호화 기능을 사용할 수 없습니다. 최신 Chrome 또는 Edge에서 열어주세요.");
    }
    return window.crypto.subtle;
  }

  async function importPublicKey(jwk) {
    return getSubtle().importKey(
      "jwk",
      jwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  }

  async function importPrivateKey(jwk) {
    return getSubtle().importKey(
      "jwk",
      jwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
  }

  function buildPublicSummary(payload) {
    const age = Number(payload.answers?.basic?.currentAge || 0);
    const ageBand = age ? `${Math.floor(age / 10) * 10}대` : "나이 미입력";
    const contactName = String(payload.contact?.name || "").trim().slice(0, 40);
    const phoneDigits = String(payload.contact?.phone || "").replace(/\D/g, "");
    return {
      schema: "fire-lead/encrypted-v1",
      source: payload.source || {},
      status: payload.status || "new",
      assignedTo: payload.assignedTo || "",
      searchName: contactName,
      phoneLast4: phoneDigits.slice(-4),
      preferredTime: String(payload.contact?.preferredTime || "").trim().slice(0, 40),
      level: payload.result?.level || "",
      ageRange: payload.result?.ageRange || "",
      variables: payload.result?.variables || [],
      ageBand,
      thirdPartyConsent: Boolean(payload.consent?.thirdParty),
      marketingConsent: Boolean(payload.consent?.marketing),
      educationConsent: Boolean(payload.consent?.education),
    };
  }

  async function encryptLeadPayload(payload) {
    const publicJwk = window.FIRE_PUBLIC_KEY_JWK;
    if (!publicJwk) throw new Error("공개키 설정이 없습니다.");

    const subtle = getSubtle();
    const publicKey = await importPublicKey(publicJwk);
    const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const plain = TEXT_ENCODER.encode(JSON.stringify(payload));
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plain);
    const rawAesKey = await subtle.exportKey("raw", aesKey);
    const encryptedKey = await subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);

    return {
      schema: "fire-lead/encrypted-v1",
      publicSummary: buildPublicSummary(payload),
      encrypted: {
        version: 1,
        keyId: window.FIRE_PUBLIC_KEY_ID || "fire-mvp-001",
        algorithm: "AES-256-GCM+RSA-OAEP-SHA256",
        iv: toBase64Url(iv.buffer),
        encryptedKey: toBase64Url(encryptedKey),
        ciphertext: toBase64Url(ciphertext),
      },
    };
  }

  async function decryptLeadEnvelope(encrypted, privateJwk) {
    const subtle = getSubtle();
    const privateKey = await importPrivateKey(privateJwk);
    const rawAesKey = await subtle.decrypt({ name: "RSA-OAEP" }, privateKey, fromBase64Url(encrypted.encryptedKey));
    const aesKey = await subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(fromBase64Url(encrypted.iv)) },
      aesKey,
      fromBase64Url(encrypted.ciphertext),
    );
    return JSON.parse(TEXT_DECODER.decode(plain));
  }

  window.FireCrypto = {
    encryptLeadPayload,
    decryptLeadEnvelope,
    importPrivateKey,
  };
})();
