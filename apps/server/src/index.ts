import { env } from "@framerfordevs/env/server";

import { createApp } from "./app";

const app = createApp();
const port = new URL(env.BETTER_AUTH_URL).port || "3000";

app.listen(Number(port), () => {
  console.log(`Server is running on http://localhost:${port}`);
});
