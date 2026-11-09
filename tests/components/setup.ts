jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  usePathname: () => "/app",
  useLocalSearchParams: () => ({}),
  Link: jest.requireActual("react-native").Text,
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("@react-native-community/datetimepicker", () => ({
  __esModule: true,
  default: () => null,
}));
