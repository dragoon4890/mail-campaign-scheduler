import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`api listening on :${config.PORT} (${config.NODE_ENV})`);
});
