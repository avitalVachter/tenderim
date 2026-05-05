import path from 'path';
import { mkdir } from 'fs/promises';

export function getDataDir(): string {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
}

export function getTenderDir(tenderId: string): string {
  return path.join(getDataDir(), 'tenders', tenderId);
}

export function getAbsolutePath(relPath: string): string {
  return path.join(getDataDir(), relPath);
}

export function makeRelativePath(tenderId: string, filename: string): string {
  return `tenders/${tenderId}/${filename}`;
}

export async function ensureTenderDir(tenderId: string): Promise<string> {
  const dir = getTenderDir(tenderId);
  await mkdir(dir, { recursive: true });
  return dir;
}
