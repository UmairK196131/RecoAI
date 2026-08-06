import type { FeatureExtractionPipeline, Tensor } from "@xenova/transformers";

import { EMBEDDING_MODEL_ID } from "./constants.server";

type EmbeddingPipeline = FeatureExtractionPipeline;

let embeddingPipeline: EmbeddingPipeline | null = null;
let pipelinePromise: Promise<EmbeddingPipeline> | null = null;

async function loadEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  const { pipeline } = await import("@xenova/transformers");
  return pipeline("feature-extraction", EMBEDDING_MODEL_ID, {
    quantized: true,
  });
}

export async function getEmbeddingPipeline(): Promise<EmbeddingPipeline> {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (!pipelinePromise) {
    pipelinePromise = loadEmbeddingPipeline().then((loaded) => {
      embeddingPipeline = loaded;
      return loaded;
    });
  }

  return pipelinePromise;
}

function tensorToVector(tensor: Tensor): number[] {
  const data = tensor.data as Float32Array | number[];
  return Array.from(data);
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });

  return tensorToVector(output);
}
