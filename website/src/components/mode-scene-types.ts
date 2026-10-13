export type ModeSceneTool = {
  verb: string;
  target: string;
  meta?: string;
};

export type ModeSceneHypothesis = {
  id: string;
  text: string;
};

export type ModeSceneLogLine = {
  time: string;
  text: string;
  tag?: string;
};

export type ModeSceneDiffLine = {
  kind: 'del' | 'add' | 'ctx';
  text: string;
};

export type ModeSceneData =
  | {
      variant: 'ask';
      thought: string;
      tools: ModeSceneTool[];
      snippet: {
        path: string;
        lines: string[];
      };
      segments: string[];
      modeLabel: string;
      modelLabel: string;
      placeholder: string;
    }
  | {
      variant: 'plan';
      thought: string;
      question: {
        title: string;
        prompt: string;
        options: string[];
        selectedIndex: number;
        skipLabel: string;
        continueLabel: string;
      };
      plan: {
        label: string;
        title: string;
        overview: string;
        viewLabel: string;
        buildLabel: string;
        shortcut: string;
      };
      modeLabel: string;
      modelLabel: string;
      placeholder: string;
    }
  | {
      variant: 'debug';
      thought: string;
      intro: string;
      hypotheses: ModeSceneHypothesis[];
      logs: {
        title: string;
        count: string;
        status: string;
        path: string;
        filterLabel: string;
        filterAll: string;
        lines: ModeSceneLogLine[];
      };
      modeLabel: string;
      modelLabel: string;
      placeholder: string;
    }
  | {
      variant: 'agent';
      thought: string;
      subagent: {
        title: string;
        type: string;
        status: string;
      };
      segments: string[];
      diff: {
        badge: string;
        fileName: string;
        dir: string;
        additions: number;
        deletions: number;
        lines: ModeSceneDiffLine[];
      };
      modeLabel: string;
      modelLabel: string;
      placeholder: string;
    };
