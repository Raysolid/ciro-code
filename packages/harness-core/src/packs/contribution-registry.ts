import type { PackSidePanelContribution } from '@ciro/harness-shared';

/** 内存贡献表：仅由 PackStore.reload 写入已启用 Pack */
export class PackContributionRegistry {
  private sidePanels: Array<PackSidePanelContribution & { packId: string }> = [];

  clear(): void {
    this.sidePanels = [];
  }

  registerSidePanel(packId: string, panel: PackSidePanelContribution): void {
    if (!panel.id || !panel.label) return;
    this.sidePanels.push({ packId, id: panel.id, label: panel.label });
  }

  listSidePanels(): Array<PackSidePanelContribution & { packId: string }> {
    return [...this.sidePanels];
  }
}
