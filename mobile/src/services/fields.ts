/** Platform-independent command input. Repeated fields are explicit arrays. */
export type CommandInput = Record<string, string | string[] | undefined>;
export class Fields {
  private values: CommandInput;
  constructor(values: CommandInput = {}) {
    this.values = { ...values };
  }
  get(name: string): string | null {
    const value = this.values[name];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }
  getAll(name: string): string[] {
    const value = this.values[name];
    return Array.isArray(value) ? value : value === undefined ? [] : [value];
  }
  set(name: string, value: string) {
    this.values[name] = value;
  }
  append(name: string, value: string) {
    this.values[name] = [...this.getAll(name), value];
  }
  object(): CommandInput {
    return { ...this.values };
  }
}
