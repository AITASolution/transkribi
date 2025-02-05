// Browser-compatible temporary storage implementation
export async function saveTempFile(data: Buffer | Blob, filename: string): Promise<File> {
  if (data instanceof Blob) {
    return new File([data], filename, { type: data.type });
  }
  return new File([data], filename);
}

export async function deleteTempFile() {
  // In browser environment, garbage collection will handle cleanup
  // No explicit deletion needed
}