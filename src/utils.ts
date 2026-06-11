import { Layer, Trait } from './types';

/**
 * 计算并更新每个 Trait 的概率
 */
export const calculateProbabilities = (traits: Trait[]): Trait[] => {
  const totalWeight = traits.reduce((sum, t) => sum + t.weight, 0);
  return traits.map((t) => ({
    ...t,
    probability: totalWeight > 0 ? (t.weight / totalWeight) : 0,
  }));
};

/**
 * 估算总组合数
 */
export const calculateTotalCombinations = (layers: Layer[]): number => {
  return layers
    .filter((l) => l.enabled)
    .reduce((acc, layer) => acc * Math.max(1, layer.traits.length), 1);
};

/**
 * 加权随机选择算法
 */
export const weightedRandomSelect = (traits: Trait[]): Trait | null => {
  if (traits.length === 0) return null;
  const totalWeight = traits.reduce((sum, t) => sum + t.weight, 0);
  if (totalWeight <= 0) return traits[Math.floor(Math.random() * traits.length)]; // 防御：如果权重都是0，则纯随机

  let random = Math.random() * totalWeight;
  
  for (const trait of traits) {
    if (random < trait.weight) return trait;
    random -= trait.weight;
  }
  return traits[traits.length - 1];
};

/**
 * 生成单个随机预览组合 (供 App.tsx 引用)
 */
export const generateRandomCombination = (layers: Layer[]): { trait: Trait, layerName: string, layerId: string, traitId: string }[] => {
  const result: { trait: Trait, layerName: string, layerId: string, traitId: string }[] = [];
  // 按 order 排序，从小到大
  const sortedLayers = [...layers].filter(l => l.enabled).sort((a, b) => a.order - b.order);

  for (const layer of sortedLayers) {
    const selected = weightedRandomSelect(layer.traits);
    if (selected) {
      result.push({ 
        trait: selected, 
        layerName: layer.name,
        layerId: layer.id,
        traitId: selected.id 
      });
    }
  }
  return result;
};

/**
 * 在 Canvas 上绘制组合图
 */
export const drawCombinationToCanvas = async (
  canvas: HTMLCanvasElement,
  combination: { trait: Trait }[],
  width: number,
  height: number
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  for (const item of combination) {
    if (item.trait.previewUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          resolve();
        };
        img.onerror = () => resolve(); // 防止图片加载失败卡死
        img.src = item.trait.previewUrl!;
      });
    }
  }
};