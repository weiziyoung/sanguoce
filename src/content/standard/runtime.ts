import { ContentRuntime } from '../../rules/content-runtime.ts';
import { standardContent } from './content.ts';

let runtime: ContentRuntime | null = null;
export const getStandardRuntime = (): ContentRuntime => runtime ??= new ContentRuntime(standardContent);
