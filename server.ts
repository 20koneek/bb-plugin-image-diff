// Image diff reads image sides from bb's Git plugin in app.tsx. The server only
// bridges one call to the host entry, for images stored in Git LFS.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract } from "./contract";

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  bb.rpc.register(rpcContract, {
    lfsObject: async ({ environmentId, threadId, ...object }) => {
      const id = environmentId ?? (threadId ? (await bb.sdk.threads.get({ threadId })).environmentId : null);
      if (!id) return { outcome: "unavailable" as const, message: "This thread has no environment." };
      const environment = await bb.sdk.environments.get({ environmentId: id });
      if (!environment.path || !environment.isGitRepo) return { outcome: "unavailable" as const, message: "This environment has no Git workspace." };
      return host.call("lfsObject", { workspace: environment.path, ...object }, { hostId: environment.hostId });
    },
  });
}
