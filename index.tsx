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
import { RequestContext } from "./src/utils";

declare module "frame-master/plugin/utils" {
  interface CustomDirectives {
    "use-streaming": true;
  }
}

export type ReactStreamingPluginOptions = {
  /**
   * The source directory to scan for 'use-streaming' directives.
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
            { filter: /\?react-streaming-original-file=.*/ },
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
                .split("?react-streaming-original-file=")
                .at(0)!;
              return {
                contents: await Bun.file(originalPath).text(),
                loader: "tsx",
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
          matched.filePath +
            (isDev()
              ? `?react-streaming-original-file=${Date.now()}`
              : "?react-streaming-original-file=0")
        )) as { default?: () => JSX.Element | Promise<JSX.Element> };
        if (!_module.default) return;

        const WrappedComponent = (
          <RequestContext.Provider value={master}>
            <_module.default />
          </RequestContext.Provider>
        );

        master.setResponse(
          await renderToReadableStream(
            (await options.parseEntryPoint?.(
              WrappedComponent,
              master,
              router
            )) ?? WrappedComponent,
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
