import { buildApp } from "./app.js";

const app = buildApp();

app.listen({ port: 3000, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("Backend running on http://localhost:3000");
});
