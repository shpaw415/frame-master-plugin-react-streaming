import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { name, version } from "./package.json";
import type { JSX } from "react";
import type { masterRequest } from "frame-master/server/request";
import { isDev } from "frame-master/utils";
import {
  renderToReadableStream,
  type RenderToReadableStreamOptions,
} from "react-dom/server";
import { directiveToolSingleton } from "frame-master/plugin";

declare module "frame-master/plugin/utils" {
  interface CustomDirectives {
    "use-streaming": true;
  }
}

export type ReactStreamingPluginOptions = {
  /**
   * The source directory to scan for 'use-dynamic' directives.
   */
  baseSrc: string;
  /**
   * A function to parse the entry point JSX element.
   *
   * Useful for wrapping the page element with additional providers or layouts.
   */
  parseEntryPoint?: (
    pageElement: JSX.Element,
    request: masterRequest,
    router: Bun.FileSystemRouter
  ) => JSX.Element | Promise<JSX.Element>;
  /**
   * Options to pass to `renderToReadableStream`.
   */
  streamingOptions?: RenderToReadableStreamOptions;
};

/**
 * frame-master-plugin-react-streaming - Frame-Master Plugin
 *
 * Description: Add your plugin description here
 */
export default function ReactStreamingPlugin(
  options: ReactStreamingPluginOptions
): FrameMasterPlugin {
  const router = new Bun.FileSystemRouter({
    dir: options.baseSrc,
    style: "nextjs",
    fileExtensions: [".tsx", ".jsx"],
  });

  return {
    name,
    version,
    runtimePlugins: [
      {
        name: "react-streaming-runtime-original-file-importer",
        setup(build) {
          build.onResolve(
            { filter: /^react-streaming-original-file:*/ },
            (args) => {
              return {
                path: args.path,
                namespace: "react-streaming-original-file",
              };
            }
          );
          build.onLoad(
            { filter: /.*/, namespace: "react-streaming-original-file" },
            async (args) => {
              const originalPath = args.path
                .replace(/^react-streaming-original-file:/, "")
                .split("?v=")
                .at(0)!;
              return {
                contents: await Bun.file(originalPath).text(),
              };
            }
          );
        },
      },
    ],
    directives: [
      {
        name: "use-streaming",
        regex:
          /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]streaming['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m,
      },
    ],
    router: {
      async request(master) {
        if (master.isResponseSetted()) return;
        const matched = router.match(master.URL.pathname);
        if (!matched) return;
        if (
          !(await directiveToolSingleton.pathIs(
            "use-streaming",
            matched.filePath
          ))
        )
          return;

        const _module = (await import(
          "react-streaming-original-file:" +
            matched.filePath +
            (isDev() ? `?v=${Date.now()}` : "")
        )) as { default?: () => JSX.Element | Promise<JSX.Element> };
        if (!_module.default) return;

        const pageElement = await _module.default();
        master.setResponse(
          await renderToReadableStream(
            (await options.parseEntryPoint?.(pageElement, master, router)) ??
              pageElement,
            options.streamingOptions
          ),
          {
            headers: {
              "Content-Type": "text/html",
            },
          }
        );
      },
    },

    requirement: {
      frameMasterVersion: "^3.0.0",
      bunVersion: ">=1.2.0",
    },
  };
}
