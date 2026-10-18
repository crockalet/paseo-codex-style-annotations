import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SideChatPanel } from "./client/side-chat-panel";
import { installSelectionBar } from "./client/web";
import { createAnnotationPreferences } from "./client/annotation-preferences";
import { installAnnotationSettings } from "./client/annotation-settings";
import { installPluginCardName } from "./client/plugin-card-name";

export default function contribute(client: PluginClientContext) {
  const preferences = createAnnotationPreferences(client);
  const removeSettings = installAnnotationSettings(client, preferences);
  const removePanel = client.addWorkspacePanel({
    id: "side-chat",
    title: "Side chat",
    icon: "MessagesSquare",
    context: "agent",
    locations: ["explorer", "workspace"],
    Component: SideChatPanel,
  });
  const removeBar = installSelectionBar(client, preferences);
  const removeCardName = installPluginCardName();
  return () => {
    removeCardName();
    removeBar();
    removePanel(); removeSettings(); preferences.dispose();
  };
}
