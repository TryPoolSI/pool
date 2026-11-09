export class Navigation extends Error {
  target: string;
  constructor(target: string) {
    super(`redirect:${target}`);
    this.target = target;
  }
}
export function redirect(target: string): never {
  throw new Navigation(target);
}
export function notFound(): never {
  throw new Unavailable("This page is unavailable to this account.");
}
export class Unavailable extends Error {}
