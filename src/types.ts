export interface Trait {
  id: string;
  name: string;
  filename: string;
  weight: number;
  probability?: number; // 运行时计算
  file?: File;          // 内存中持有的文件对象
  previewUrl?: string;  // 内存预览 URL
}

export interface Layer {
  id: string;
  name: string;
  order: number;        // 0 是最底层
  traits: Trait[];
  enabled: boolean;
}

export interface ProjectConfig {
  projectName: string;
  description: string;
  totalSupply: number;
  width: number;
  height: number;
  outputFormat: 'png' | 'jpeg';
}

// 导出时用的精简结构
export interface ExportData {
  projectConfig: ProjectConfig;
  layers: Omit<Layer, 'file' | 'previewUrl'>[];
}