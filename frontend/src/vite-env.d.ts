/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Application Insights connection string for usage telemetry. Absent in local
// builds and in any environment that has not opted in, which leaves src/telemetry.ts
// inert: no client is constructed and nothing is sent. See the experiment notes in
// that file.
interface ImportMetaEnv {
  readonly VITE_APPINSIGHTS_CONNECTION_STRING?: string;
}
