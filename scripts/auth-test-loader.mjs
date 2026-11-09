import { registerHooks } from "node:module";

// Match Next's aliases/extensionless imports while running the actual TS helpers
// with Node's built-in type stripping. Tests mock only framework/SDK boundaries.
export function registerAuthTestLoader() {
  return registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/"))
        return nextResolve(
          new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
          context,
        );
      if (
        specifier.startsWith(".") &&
        context.parentURL?.includes("/src/") &&
        !/\.[a-z]+$/.test(specifier)
      ) {
        return nextResolve(
          new URL(`${specifier}.ts`, context.parentURL).href,
          context,
        );
      }
      return nextResolve(specifier, context);
    },
  });
}
