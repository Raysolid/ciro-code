/** Feature Pack 侧栏贡献（@internal） */
export type PackSidePanelContribution = {
  id: string;
  label: string;
};

export type PackManifest = {
  id: string;
  displayName: string;
  version: string;
  engines?: { ciro?: string };
  contributions?: {
    sidePanels?: PackSidePanelContribution[];
  };
};

export type PackListItem = {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
  installPath: string;
  compatible: boolean;
  incompatibilityReason?: string;
  contributions: {
    sidePanels: PackSidePanelContribution[];
  };
};

export type PacksListResponse = {
  packs: PackListItem[];
  contributions: {
    sidePanels: Array<PackSidePanelContribution & { packId: string }>;
  };
};
