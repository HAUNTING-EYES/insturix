export interface FootageSelection {
  files: File[];
  rejected: Array<{ name: string; type: string }>;
}

export function isSupportedFootageFile(file: Pick<File, 'type'>): boolean {
  return file.type.startsWith('video/') || file.type.startsWith('image/');
}

export function collectFootageFiles(input: FileList | File[] | null | undefined): FootageSelection {
  const allFiles = Array.from(input ?? []);
  const files: File[] = [];
  const rejected: FootageSelection['rejected'] = [];

  for (const file of allFiles) {
    if (isSupportedFootageFile(file)) {
      files.push(file);
    } else {
      rejected.push({ name: file.name, type: file.type || 'unknown' });
    }
  }

  return { files, rejected };
}