export function downloadMd(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const mdToday = (): string =>
  new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
