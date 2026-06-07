import serverless from "serverless-http";
import app from "../../src/index.ts";

export const handler = serverless(app);