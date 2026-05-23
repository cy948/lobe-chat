import type { AgentEvalDatasetListItem } from './agentEvalDataset';
import type { AgentEvalRunListItem } from './agentEvalRun';

export interface AgentEvalExperimentBenchmark {
  description?: string | null;
  id: string;
  identifier?: string;
  isSystem?: boolean;
  name: string;
}

export interface AgentEvalExperiment {
  accessedAt: Date;
  benchmarkCount?: number;
  benchmarks: AgentEvalExperimentBenchmark[];
  createdAt: Date;
  datasetCount?: number;
  description?: string | null;
  id: string;
  metadata?: Record<string, unknown> | null;
  name: string;
  runCount?: number;
  updatedAt: Date;
  userId: string;
}

export interface AgentEvalExperimentListItem {
  accessedAt: Date;
  benchmarkCount: number;
  benchmarks: AgentEvalExperimentBenchmark[];
  createdAt: Date;
  datasetCount: number;
  description?: string | null;
  id: string;
  metadata?: Record<string, unknown> | null;
  name: string;
  runCount: number;
  updatedAt: Date;
  userId: string;
}

export interface AgentEvalExperimentDetail extends AgentEvalExperiment {
  datasets: AgentEvalDatasetListItem[];
  runs: AgentEvalRunListItem[];
}
