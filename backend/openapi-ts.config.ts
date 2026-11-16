export default {
  input: "../contract/openapi/openapi.yaml",
  output: {
    path: "src/api/generated",
    clean: true,
    module: { extension: ".js" },
  },
  plugins: ["@hey-api/typescript"],
};
