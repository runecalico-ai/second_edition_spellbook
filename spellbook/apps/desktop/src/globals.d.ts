export {};

declare global {
  interface Window {
    __IS_PLAYWRIGHT__?: boolean;
  }
}
