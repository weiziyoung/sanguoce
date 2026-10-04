/** Resolve a gendered voice from candidates already sorted by source priority. */
export function cardAudioSource(label: string, sex: 'male' | 'female', candidates: readonly string[]): string | undefined {
  const gender = sex === 'male' ? '男.mp3' : '女.mp3';
  return candidates.find(path => {
    // These two supplied recordings have reversed filenames. Correct only this
    // source directory; other editions and cards keep their original mapping.
    const reversed = path.includes('/音乐/旧互通版/装备牌/武器牌/身份局/麒麟弓/');
    const filename = reversed ? sex === 'male' ? '女.mp3' : '男.mp3' : gender;
    return path.endsWith(`/${filename}`);
  }) ?? candidates.find(path => path.endsWith(`/${label}.mp3`));
}
