import { AppController } from "./app/app-controller";
const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Application root was not found.");
new AppController(root).mount();
