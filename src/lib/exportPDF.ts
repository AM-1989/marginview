import { pdf } from '@react-pdf/renderer';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function downloadPDF(doc: React.ReactElement<any>, filename: string): Promise<void> {
  const blob = await pdf(doc).toBlob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
