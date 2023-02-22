import { createApp } from "./main";
import { renderToString } from "@vue/server-renderer";

export async function render() {
  return await renderToString(createApp());
}
