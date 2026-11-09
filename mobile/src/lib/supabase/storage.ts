import * as SecureStore from "expo-secure-store";
// Versioned chunks keep large Supabase sessions below historical Keychain limits.
// Publish the manifest last, so an interrupted refresh cannot expose partial data.
const chunkSize = 350;
function manifest(
  value: string | null,
): { generation: string; count: number } | null {
  try {
    const parsed = JSON.parse(value ?? "null");
    return parsed &&
      typeof parsed.generation === "string" &&
      /^[a-z0-9-]+$/.test(parsed.generation) &&
      Number.isInteger(parsed.count) &&
      parsed.count >= 1 &&
      parsed.count <= 100
      ? parsed
      : null;
  } catch {
    return null;
  }
}
export const storage = {
  async getItem(key: string) {
    const saved = manifest(await SecureStore.getItemAsync(key));
    if (!saved) return null;
    const { generation, count } = saved;
    if (!Number.isInteger(count) || count < 1 || count > 100) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        SecureStore.getItemAsync(`${key}.${generation}.${i}`),
      ),
    );
    return parts.some((p) => p === null) ? null : parts.join("");
  },
  async setItem(key: string, value: string) {
    const old = manifest(await SecureStore.getItemAsync(key));
    const generation = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const characters = Array.from(value);
    const count = Math.max(1, Math.ceil(characters.length / chunkSize));
    if (count > 100)
      throw new Error("Session exceeds secure storage capacity.");
    for (let i = 0; i < count; i++)
      await SecureStore.setItemAsync(
        `${key}.${generation}.${i}`,
        characters.slice(i * chunkSize, (i + 1) * chunkSize).join(""),
      );
    await SecureStore.setItemAsync(key, JSON.stringify({ generation, count }));
    if (old) {
      const previous = old;
      for (let i = 0; i < previous.count; i++)
        await SecureStore.deleteItemAsync(`${key}.${previous.generation}.${i}`);
    }
  },
  async removeItem(key: string) {
    const saved = manifest(await SecureStore.getItemAsync(key));
    await SecureStore.deleteItemAsync(key);
    if (saved) {
      const previous = saved;
      for (let i = 0; i < previous.count; i++)
        await SecureStore.deleteItemAsync(`${key}.${previous.generation}.${i}`);
    }
  },
};
