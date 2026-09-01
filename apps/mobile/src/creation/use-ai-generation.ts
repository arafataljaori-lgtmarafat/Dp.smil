import { useState, useCallback } from 'react';
import { dentPilotApi } from '../api/client';

export interface UseAiGenerationResult {
  readonly isGenerating: boolean;
  readonly error: string | null;
  readonly triggerGeneration: (projectId: string, idempotencyKey?: string) => Promise<string | null>;
}

export function useAiGeneration(): UseAiGenerationResult {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerGeneration = useCallback(
    async (projectId: string, idempotencyKey?: string): Promise<string | null> => {
      setIsGenerating(true);
      setError(null);

      try {
        const key = idempotencyKey ?? `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        
        // 1. Request generation via existing dentPilotApi client layer
        const { id: generationJobId } = await dentPilotApi.requestGeneration(projectId, key);

        // 2. Poll for completion using dentPilotApi
        let attempts = 0;
        while (attempts < 15) {
          attempts++;
          await new Promise((r) => setTimeout(r, 2000));

          const data = await dentPilotApi.getGeneration(generationJobId);

          if (data.job.status === 'completed' && data.version) {
            setIsGenerating(false);
            return data.version.mediaAssetId;
          }

          if (data.job.status === 'failed') {
            throw new Error(data.job.errorCode ?? 'AI Generation failed on server');
          }
        }

        throw new Error('AI Generation timed out waiting for server completion');
      } catch (err) {
        const msg = (err as Error).message;
        setError(msg);
        setIsGenerating(false);
        return null;
      }
    },
    [],
  );

  return { isGenerating, error, triggerGeneration };
}
