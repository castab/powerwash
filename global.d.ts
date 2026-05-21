declare global {
  interface Window {
    HSStaticMethods: {
      autoInit: (collection?: string[]) => void;
    };
  }
}

export {};
