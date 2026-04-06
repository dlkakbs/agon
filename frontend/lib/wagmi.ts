import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arcTestnet } from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "Agent Bounty Protocol",
  projectId: "780126d1008ee6fdd65dbc8837c25dac",
  chains: [arcTestnet],
  ssr: true,
});
