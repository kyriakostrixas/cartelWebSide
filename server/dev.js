import express from "express";
import { createApp } from "./createApp.js";
import { config } from "./config.js";

const app = createApp();

app.use(express.static("dist"));

app.listen(config.port, () => {
  console.log(`Cartel Express API running at http://127.0.0.1:${config.port}`);
});
