import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";
import { createServer as createViteServer, ViteDevServer } from "vite";

type Path = string;

const isProd = process.env.NODE_ENV === "production";
/* TODO 预请求 & 增量构建 */
async function createServer() {
  const app = express();

  // 使用中间件
  const vite = await useMiddleware(app);

  // 服务 index.html
  app.use("*", async (req, res, next) => {
    // 如果 `middlewareMode` 是 `'ssr'`，应在此为 `index.html` 提供服务.
    // 如果 `middlewareMode` 是 `'html'`，则此处无需手动服务 `index.html`，因为 Vite 自会接管

    try {
      const url = req.originalUrl;

      let template, render;
      if (!isProd) {
        // 1. 读取 index.html
        template = fs.readFileSync(resolve("index.html"), "utf-8");
        // 2. 应用 Vite HTML 转换。这将会注入 Vite HMR 客户端，
        //    同时也会从 Vite 插件应用 HTML 转换。
        //    例如：@vitejs/plugin-react 中的 global preambles
        template = await vite!.transformIndexHtml(url, template);
        // 3. 加载服务器入口。vite.ssrLoadModule 将自动转换
        //    你的 ESM 源码使之可以在 Node.js 中运行！无需打包
        //    并提供类似 HMR 的根据情况随时失效。
        render = (await vite!.ssrLoadModule("/src/entry-server.ts")).render;
      } else {
        template = fs.readFileSync(resolve("dist/client/index.html"), "utf-8");
        render = (await import("./dist/server/entry-server.js")).render;
      }
      // 4. 渲染应用的 HTML。这假设 entry-server.js 导出的 `render`
      //    函数调用了适当的 SSR 框架 API。
      const appHtml = await render();
      // 5. 注入渲染后的应用程序 HTML 到模板中。
      const html = template.replace(`<!-- ssr-app -->`, appHtml);

      // 6. 返回渲染后的 HTML。
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e: any) {
      // 如果捕获到了一个错误，让 Vite 来修复该堆栈，这样它就可以映射回
      // 你的实际源码中。
      vite && vite.ssrFixStacktrace(e);
      console.log(e.stack);
      res.status(500).end(e.stack);
    }
  });

  app.listen(3001, () => {
    console.log("Node 服务器已启动~");
    console.log("http://localhost:3001");
  });
}

async function useMiddleware(app) {
  let vite: ViteDevServer | null = null;
  if (!isProd) {
    // 以中间件模式创建 Vite 应用，这将禁用 Vite 自身的 HTML 服务逻辑
    // 并让上级服务器接管控制
    vite = await createViteServer({
      root: process.cwd(),
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100
        }
      },
      appType: "custom" // 不引入 Vite 默认的 HTML 处理中间件
    });

    // 使用 vite 的 Connect 实例作为中间件
    // 如果你使用了自己的 express 路由（express.Router()），你应该使用 router.use
    app.use(vite.middlewares);
  } else {
    app.use((await import("compression")).default());
    app.use(
      (await import("serve-static")).default(resolve("dist/client"), {
        index: false
      })
    );
  }
  return vite;
}

function resolve(p: Path): Path {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, p);
}

createServer();
