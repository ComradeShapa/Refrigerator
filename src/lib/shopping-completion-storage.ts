import {
  loadCompletionSnapshot,
  commitShoppingCompletion,
} from "@/lib/storage";
import {
  previewCompletion,
  prepareCompletion,
  type CompletionPreview,
  type CompletionTarget,
} from "@/lib/shopping-completion";

export function loadCompletionPreview(
  target: CompletionTarget
): CompletionPreview {
  return previewCompletion(loadCompletionSnapshot(), target);
}
export function completeShoppingTrip(
  preview: CompletionPreview,
  selected: string[],
  now: string,
  createId: () => string
): void {
  // Финальное чтение, проверка, расчёт и journal выполняются без async-разрыва.
  commitShoppingCompletion((snapshot) =>
    prepareCompletion(snapshot, preview, selected, now, createId)
  );
}
