import { NAMES, type Card } from "../../catalog.ts";

export function displayName(value: string, cards?: Readonly<Record<number, Card>>): string {
  const result = (NAMES as Record<string, string>)[value] ??
    Object.values(cards ?? {}).find(card => card.name === value)?.label;
  if (!result) throw new Error("牌名中文映射缺失");
  return result;
}
