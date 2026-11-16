export default {
  input: "../contract/openapi/openapi.yaml",
  output: {
    path: "src/api/generated",
    clean: true,
  },
  plugins: ["@hey-api/client-fetch", "@hey-api/sdk", "@hey-api/typescript"],
};
