import expo from "eslint-config-expo/flat.js";
export default [
  ...expo,
  {
    ignores: [
      "dist/**",
      "dist-ios/**",
      ".expo/**",
      "ios/**",
      "android/**",
      "sites/**",
      "exports/**",
      "mobile/**",
      "supabase/.temp/**",
    ],
  },
];
