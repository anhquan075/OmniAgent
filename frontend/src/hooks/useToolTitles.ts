import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

interface ToolMetadata {
  name: string;
  description: string;
  parameters: string[];
}

interface ToolTitles {
  [key: string]: string;
}

const toolTitlesCache: ToolTitles = {};

export function useToolTitles() {
  const [titles, setTitles] = useState<ToolTitles>(() => {
    if (Object.keys(toolTitlesCache).length > 0) {
      return toolTitlesCache;
    }
    return {};
  });
  const [loading, setLoading] = useState(Object.keys(toolTitlesCache).length === 0);
  const [error, setError] = useState<string | null>(null);

  const fetchTitles = useCallback(async () => {
    if (Object.keys(toolTitlesCache).length > 0) {
      setTitles({ ...toolTitlesCache });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(getApiUrl('/api/tools'));
      if (!res.ok) throw new Error('Failed to fetch tool titles');
      const data = await res.json();
      const tools: ToolMetadata[] = data.tools || [];

      const titleMap: ToolTitles = {};
      for (const tool of tools) {
        titleMap[tool.name] = tool.description;
      }

      Object.assign(toolTitlesCache, titleMap);
      setTitles(titleMap);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTitles();
  }, [fetchTitles]);

  return { titles, loading, error, refetch: fetchTitles };
}

export function getToolTitle(titles: ToolTitles, toolName: string): string {
  return titles[toolName] || toolName;
}
