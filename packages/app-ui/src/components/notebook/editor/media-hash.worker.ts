import { sha256 } from "@noble/hashes/sha2.js";

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const hasher = sha256.create();
    const reader = event.data.stream().getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      hasher.update(value);
    }
    const hash = Array.from(hasher.digest())
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    self.postMessage({ hash });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
