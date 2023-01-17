import { createSSRApp } from "vue";
import App from "./App.vue";

export const render = () => {
  return createSSRApp(App);
};
