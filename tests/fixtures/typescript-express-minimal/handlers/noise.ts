const cache = new Map<string, string>();

export function lookup(key: string): string | undefined {
  return cache.get(key);
}

export const messages = {
  get(key: string): string {
    return key;
  },
  post(key: string): void {
    cache.set(key, key);
  },
};

messages.get("about");
messages.post("login");
