module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/components/**/*.test.ts?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/sites/", "/exports/"],
  modulePathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/dist/",
    "<rootDir>/dist-ios/",
  ],
  setupFilesAfterEnv: ["<rootDir>/tests/components/setup.ts"],
  collectCoverageFrom: ["src/services/**/*.{ts,tsx}", "src/ui/*.{ts,tsx}"],
};
