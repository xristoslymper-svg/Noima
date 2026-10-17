// Standalone esbuild fixture only. Next normally replaces public process.env
// reads at build time; no secret/configuration is copied into this harness.
Reflect.set(globalThis,'process',{env:{NODE_ENV:'production',NEXT_PUBLIC_NOIMA_MOBILE_V2:'0'}});
export {};
