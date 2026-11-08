import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: [path.resolve(dirname, "../../../apps/web/public")],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};
